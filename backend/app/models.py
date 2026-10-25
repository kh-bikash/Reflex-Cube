"""Database models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobStatusValue:
    """Lifecycle states a training job moves through.

    Shared with the frontend via `GET /api/training/status/{job_id}`, so these
    strings are part of the API contract.
    """

    QUEUED = "queued"
    INITIALIZING = "initializing"
    ANALYZING_PROMPT = "analyzing_prompt"
    LOADING_DATA = "loading_data"
    TRAINING = "training"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

    #: States from which a job can still progress; used to reap jobs orphaned
    #: by a server restart and to decide when an SSE stream may close.
    ACTIVE = (QUEUED, INITIALIZING, ANALYZING_PROMPT, LOADING_DATA, TRAINING)
    TERMINAL = (COMPLETED, FAILED, CANCELLED)


class User(Base):
    """An account. Jobs belong to a user, so one person's work is their own."""

    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    display_name = Column(String, nullable=False, default="")
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    #: Per-user Hugging Face token, used to push their trained models to their
    #: own Hub account. Optional; without it models stay on the server.
    hf_token = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    jobs = relationship("TrainingJob", back_populates="user")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<User {self.email}>"


class TrainingJob(Base):
    __tablename__ = "training_jobs"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, default="")
    prompt = Column(Text, nullable=False, default="")
    task = Column(String, nullable=False, default="text-generation")
    status = Column(String, nullable=False, default=JobStatusValue.QUEUED, index=True)
    progress = Column(Integer, nullable=False, default=0)
    epoch = Column(Float, nullable=False, default=0.0)
    loss = Column(Float, nullable=True)
    accuracy = Column(Float, nullable=True)

    #: Base model and dataset the interpreter resolved for this prompt.
    model_name = Column(String, nullable=True)
    dataset_name = Column(String, nullable=True)

    result_path = Column(String, nullable=True)
    error = Column(Text, nullable=True)

    #: Hub repo the finished model was pushed to, when model publishing is on.
    #: Hosted containers have ephemeral disks, so this is what makes a trained
    #: model outlive the instance that produced it.
    hub_repo_id = Column(String, nullable=True)

    user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    user = relationship("User", back_populates="jobs")

    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<TrainingJob {self.id} {self.status} {self.progress}%>"


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"

    email = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
