"""Database models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

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

    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<TrainingJob {self.id} {self.status} {self.progress}%>"


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"

    email = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
