#!/usr/bin/env python
"""Background runner for one training job.

Spawned by `POST /api/models/create` as a detached subprocess so a CPU-bound
fine-tune cannot block the API event loop.

Usage:
    python train_worker.py <job_id>          # payload JSON on stdin
    python train_worker.py <job_id> '<json>' # payload as argv (legacy)

stdin is preferred: the payload holds a user-supplied prompt, and argv is both
length-limited and readable by every other process on the machine.
"""

from __future__ import annotations

import contextlib
import json
import sys
import traceback
from pathlib import Path

# Allow `python train_worker.py` from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.db import init_db
from app.logging_config import get_logger
from app.models import JobStatusValue
from app.trainer import run_training_job, update_job

logger = get_logger("train_worker")


def _read_payload(argv: list[str]) -> dict:
    """Read the job payload from argv[2] if present, else from stdin."""
    if len(argv) >= 3:
        return json.loads(argv[2])
    raw = sys.stdin.read()
    return json.loads(raw) if raw.strip() else {}


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2

    job_id = argv[1]
    try:
        payload = _read_payload(argv)
    except json.JSONDecodeError as exc:
        logger.error("Job %s: malformed payload: %s", job_id, exc)
        init_db()
        update_job(
            job_id,
            status=JobStatusValue.FAILED,
            error_msg=f"Malformed job payload: {exc}",
        )
        return 1

    logger.info("Starting job %s", job_id)
    try:
        init_db()
        run_training_job(payload, job_id)
    except Exception as exc:
        # run_training_job handles its own failures; this covers a crash in the
        # setup above it, which would otherwise leave the job stuck as "queued".
        logger.critical("Job %s crashed: %s", job_id, exc)
        traceback.print_exc()
        with contextlib.suppress(Exception):
            update_job(job_id, status=JobStatusValue.FAILED, error_msg=str(exc))
        return 1

    logger.info("Worker finished job %s", job_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
