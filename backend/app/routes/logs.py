"""Server-sent events stream of a training job's log."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..logging_config import get_logger
from ..models import JobStatusValue, TrainingJob
from ..utils import is_valid_job_id, training_log_path

logger = get_logger(__name__)

router = APIRouter(prefix="/api/logs", tags=["Logs"])

#: How long to wait for the worker to create the log file before giving up.
STARTUP_TIMEOUT_SECONDS = 60
#: Poll interval while tailing.
POLL_SECONDS = 1.0
#: Idle seconds between heartbeat comments, to keep proxies from closing the
#: connection during a long epoch that logs nothing.
HEARTBEAT_SECONDS = 15.0


def _job_is_finished(job_id: str) -> bool:
    """Read the job's status on its own short-lived session.

    The stream outlives the request-scoped session, so it cannot reuse it.
    """
    with SessionLocal() as session:
        job = session.get(TrainingJob, job_id)
        return job is None or job.status in JobStatusValue.TERMINAL


@router.get("/{job_id}")
async def stream_logs(
    job_id: str, request: Request, db: Session = Depends(get_db)
) -> StreamingResponse:
    """Stream the job's JSONL log as SSE, closing once the job is finished.

    The previous implementation looped forever even after a job completed or
    failed, so every page visit leaked a connection and a worker thread until
    the browser gave up.
    """
    if not is_valid_job_id(job_id):
        raise HTTPException(status_code=400, detail="Malformed job id")
    if db.get(TrainingJob, job_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")

    log_path = training_log_path(job_id)

    async def event_generator() -> AsyncIterator[str]:
        waited = 0.0
        while not log_path.exists():
            if await request.is_disconnected():
                return
            if waited >= STARTUP_TIMEOUT_SECONDS or _job_is_finished(job_id):
                payload = json.dumps({"stage": "error", "error": "Training log never appeared."})
                yield f"data: {payload}\n\n"
                yield "event: end\ndata: {}\n\n"
                return
            await asyncio.sleep(POLL_SECONDS)
            waited += POLL_SECONDS

        idle = 0.0
        with open(log_path, encoding="utf-8") as handle:
            while True:
                if await request.is_disconnected():
                    return

                line = handle.readline()
                if line:
                    idle = 0.0
                    yield f"data: {line.rstrip()}\n\n"
                    continue

                # Caught up. Stop once the job reached a terminal state and we
                # have drained everything it wrote.
                if _job_is_finished(job_id):
                    if handle.readline():
                        continue
                    yield "event: end\ndata: {}\n\n"
                    return

                await asyncio.sleep(POLL_SECONDS)
                idle += POLL_SECONDS
                if idle >= HEARTBEAT_SECONDS:
                    idle = 0.0
                    yield ": keep-alive\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Tell nginx not to buffer, which would defeat streaming entirely.
            "X-Accel-Buffering": "no",
        },
    )
