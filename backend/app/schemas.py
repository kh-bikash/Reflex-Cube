"""Pydantic request/response models for the public API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

#: Tasks the trainer knows how to configure a model and a dataset for.
#: "auto" asks the interpreter to infer the task from the prompt.
TaskName = Literal[
    "auto",
    "text-classification",
    "sentiment-analysis",
    "token-classification",
    "text-generation",
    "summarization",
    "translation",
    "question-answering",
]


class CreateModelRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=1, max_length=4000)
    task: TaskName | None = None


class CreateModelResponse(BaseModel):
    job_id: str
    status: str


class JobStatus(BaseModel):
    id: str
    name: str = ""
    task: str = "text-generation"
    status: str
    progress: int = 0
    epoch: float = 0.0
    loss: float | None = None
    accuracy: float | None = None
    model_name: str | None = None
    dataset_name: str | None = None
    result_path: str | None = None
    error: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class PredictRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class PredictResponse(BaseModel):
    result: Any


class DeleteResponse(BaseModel):
    status: str
    id: str


class DownloadUrlResponse(BaseModel):
    url: str


class CubeRunRequest(BaseModel):
    cube_id: str = Field(min_length=1, max_length=64)
    #: Registry cubes take a structured object; agent-backed cubes take a prompt
    #: string. Both arrive on this field.
    input: dict[str, Any] | str | None = None


class CubeInfo(BaseModel):
    id: str
    name: str
    description: str


class CubeListResponse(BaseModel):
    cubes: list[CubeInfo]
    count: int


class PDFRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    markdown: str = Field(min_length=1, max_length=500_000)


class NewsletterRequest(BaseModel):
    email: EmailStr


class NewsletterResponse(BaseModel):
    status: str
    email: str


class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    cubes: int
    storage_path: str
