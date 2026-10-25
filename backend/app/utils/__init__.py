"""Filesystem helpers shared by the API, the trainer and the cubes."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from ..config import CUBE_STORAGE_PATH, STORAGE_PATH

#: Job ids are server-generated UUIDs. Anything else is rejected before it can
#: be joined onto a storage path, so a crafted id cannot escape the directory.
_JOB_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)

TRAINING_LOG_NAME = "training_log.jsonl"


def is_valid_job_id(job_id: str) -> bool:
    """True if `job_id` is safe to use as a path component."""
    return bool(job_id) and bool(_JOB_ID_RE.match(job_id))


def job_dir(job_id: str, create: bool = True) -> Path:
    """Return `<STORAGE_PATH>/<job_id>`, creating it unless `create=False`.

    Raises:
        ValueError: if `job_id` is not a safe path component.
    """
    if not is_valid_job_id(job_id):
        raise ValueError(f"Unsafe job id: {job_id!r}")
    path = Path(STORAGE_PATH) / job_id
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path


def training_log_path(job_id: str, create: bool = False) -> Path:
    """Path of the JSONL event log the trainer appends to and SSE tails."""
    return job_dir(job_id, create=create) / TRAINING_LOG_NAME


def cube_dir(*parts: str) -> Path:
    """Return a directory under the cube scratch root, creating it."""
    path = Path(CUBE_STORAGE_PATH).joinpath(*parts)
    path.mkdir(parents=True, exist_ok=True)
    return path


def append_jsonl(path: Path, event: dict[str, Any]) -> None:
    """Append one JSON object as a line, flushed to disk.

    The SSE endpoint tails this file from another process, so the write is
    fsynced: a buffered line would otherwise reach the reader only on close.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, default=str) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    """Yield the parsed objects in a JSONL file, skipping malformed lines."""
    if not path.exists():
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def human_size(num_bytes: float) -> str:
    """Format a byte count for display, e.g. `12.4 MB`."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < 1024.0 or unit == "TB":
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} TB"
