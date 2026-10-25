"""Training-job endpoints: create, inspect, predict, download, delete."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..config import BASE_DIR, STORAGE_PATH
from ..db import get_db
from ..logging_config import get_logger
from ..models import JobStatusValue, TrainingJob
from ..schemas import (
    CreateModelRequest,
    CreateModelResponse,
    DeleteResponse,
    DownloadUrlResponse,
    JobStatus,
    PredictRequest,
    PredictResponse,
)
from ..utils import is_valid_job_id, job_dir

logger = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["Models"])

WORKER_SCRIPT = BASE_DIR / "train_worker.py"


def _get_job(db: Session, job_id: str) -> TrainingJob:
    if not is_valid_job_id(job_id):
        raise HTTPException(status_code=400, detail="Malformed job id")
    job = db.get(TrainingJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/models/create", response_model=CreateModelResponse, status_code=202)
def create_model(req: CreateModelRequest, db: Session = Depends(get_db)) -> CreateModelResponse:
    """Queue a prompt for background model generation."""
    job_id = str(uuid.uuid4())
    job = TrainingJob(
        id=job_id,
        name=req.name,
        prompt=req.prompt,
        task=req.task or "auto",
        status=JobStatusValue.QUEUED,
    )
    db.add(job)
    db.commit()

    try:
        _spawn_worker(job_id, req)
    except Exception as exc:
        logger.exception("Failed to spawn training worker for %s", job_id)
        job.status = JobStatusValue.FAILED
        job.error = f"Could not start training worker: {exc}"
        db.commit()
        raise HTTPException(status_code=500, detail=job.error) from exc

    return CreateModelResponse(job_id=job_id, status=JobStatusValue.QUEUED)


def _spawn_worker(job_id: str, req: CreateModelRequest) -> None:
    """Start `train_worker.py` as a detached subprocess.

    Training runs out of process so a CPU-bound fine-tune cannot block the
    event loop or hold the GIL against request handling.

    The job payload goes in on stdin rather than argv: it contains a
    user-supplied prompt, and argv is both length-limited (~32 KB on Windows)
    and visible to every other process on the machine.
    """
    creationflags = 0
    start_new_session = False
    if sys.platform == "win32":
        # Detach from the parent's console so Ctrl-C to the server does not kill
        # training. CREATE_NEW_PROCESS_GROUP is Windows-only — passing it on
        # POSIX raises ValueError, which is what used to happen here.
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
    else:
        start_new_session = True

    log_path = job_dir(job_id) / "worker.log"
    payload = json.dumps({"name": req.name, "prompt": req.prompt, "task": req.task})

    logger.info("Spawning training worker for job %s (log: %s)", job_id, log_path)

    with open(log_path, "a", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [sys.executable, str(WORKER_SCRIPT), job_id],
            cwd=str(BASE_DIR),
            stdin=subprocess.PIPE,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=creationflags,
            start_new_session=start_new_session,
            close_fds=True,
            text=True,
        )
    # Hand over the payload and close stdin so the worker's read() returns.
    assert process.stdin is not None
    process.stdin.write(payload)
    process.stdin.close()


@router.get("/training/status/{job_id}", response_model=JobStatus)
def training_status(job_id: str, db: Session = Depends(get_db)) -> JobStatus:
    """Current progress, metrics and status of a training job."""
    return JobStatus.model_validate(_get_job(db, job_id))


@router.get("/models/all", response_model=list[JobStatus])
def get_all_models(db: Session = Depends(get_db)) -> list[JobStatus]:
    """Every job, newest first."""
    jobs = db.query(TrainingJob).order_by(TrainingJob.created_at.desc()).all()
    return [JobStatus.model_validate(job) for job in jobs]


@router.post("/models/{job_id}/predict", response_model=PredictResponse)
async def predict(
    job_id: str, req: PredictRequest, db: Session = Depends(get_db)
) -> PredictResponse:
    """Run inference with a completed model."""
    job = _get_job(db, job_id)
    if not job.result_path or not os.path.exists(job.result_path):
        raise HTTPException(status_code=409, detail="Model is not ready yet")

    task = job.task if job.task and job.task != "auto" else "text-generation"
    result = await run_in_threadpool(_run_pipeline, job.result_path, task, req.text)
    return PredictResponse(result=result)


def _run_pipeline(model_path: str, task: str, text: str):
    """Load the saved pipeline and run one input through it."""
    try:
        from transformers import pipeline
    except ImportError as exc:  # pragma: no cover - requires the ML extra
        raise HTTPException(
            status_code=503, detail="transformers is not installed on the server"
        ) from exc

    try:
        nlp = pipeline(task, model=model_path, tokenizer=model_path)
        if task == "text-generation":
            return nlp(text, max_new_tokens=100, num_return_sequences=1)
        return nlp(text)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Inference failed for %s", model_path)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}") from exc


@router.delete("/models/{job_id}", response_model=DeleteResponse)
def delete_model(job_id: str, db: Session = Depends(get_db)) -> DeleteResponse:
    """Delete a job and its artefacts."""
    job = _get_job(db, job_id)

    artefact_dir = Path(job.result_path) if job.result_path else job_dir(job_id, create=False)
    if artefact_dir.exists():
        try:
            shutil.rmtree(artefact_dir)
        except OSError as exc:
            # A locked file should not block removing the record.
            logger.warning("Could not remove %s: %s", artefact_dir, exc)

    archive = Path(STORAGE_PATH) / f"{job_id}.zip"
    archive.unlink(missing_ok=True)

    db.delete(job)
    db.commit()
    return DeleteResponse(status="deleted", id=job_id)


def _build_archive(job: TrainingJob) -> Path:
    """Zip a job's artefacts, reusing an existing archive when it is current."""
    source = Path(job.result_path)
    archive = Path(STORAGE_PATH) / f"{job.id}.zip"

    if archive.exists():
        newest = max((f.stat().st_mtime for f in source.rglob("*") if f.is_file()), default=0)
        if archive.stat().st_mtime >= newest:
            return archive
        archive.unlink()

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file in source.rglob("*"):
            if file.is_file() and file.resolve() != archive.resolve():
                zf.write(file, arcname=file.relative_to(source))
    return archive


@router.get("/models/download/{job_id}")
async def download(job_id: str, db: Session = Depends(get_db)) -> FileResponse:
    """Download the trained model as a zip archive."""
    job = _get_job(db, job_id)
    if not job.result_path or not Path(job.result_path).exists():
        raise HTTPException(status_code=409, detail="Model is not ready yet")

    archive = await run_in_threadpool(_build_archive, job)
    return FileResponse(str(archive), filename=f"{job_id}.zip", media_type="application/zip")


@router.get("/models/download-zip-stream/{job_id}", include_in_schema=False)
async def download_zip_stream(job_id: str, db: Session = Depends(get_db)) -> FileResponse:
    """Alias kept for the existing frontend download link."""
    return await download(job_id, db)


@router.post("/models/download-zip/{job_id}", response_model=DownloadUrlResponse)
def prepare_download_zip(job_id: str, db: Session = Depends(get_db)) -> DownloadUrlResponse:
    """Return the URL to download a completed model from."""
    job = _get_job(db, job_id)
    if job.status != JobStatusValue.COMPLETED:
        raise HTTPException(status_code=409, detail=f"Job is '{job.status}', not completed")
    return DownloadUrlResponse(url=f"/api/models/download/{job_id}")
