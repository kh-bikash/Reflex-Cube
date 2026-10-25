"""The training worker and the way the API spawns it.

Regression: the spawn passed Windows-only `creationflags`, which raises
`ValueError` on POSIX, so model creation could never start on Linux or macOS.
"""

from __future__ import annotations

import inspect
import json
import subprocess
import sys
import uuid

from app.config import BASE_DIR
from app.models import JobStatusValue, TrainingJob
from app.routes.models import _spawn_worker


def test_spawn_does_not_pass_windows_flags_on_posix():
    source = inspect.getsource(_spawn_worker)
    assert 'sys.platform == "win32"' in source
    assert "start_new_session" in source


def test_payload_is_not_passed_on_the_command_line():
    """argv is length-limited and world-readable; the prompt goes on stdin."""
    source = inspect.getsource(_spawn_worker)
    assert "stdin=subprocess.PIPE" in source
    assert "process.stdin.write(payload)" in source


def test_worker_script_exists():
    assert (BASE_DIR / "train_worker.py").is_file()


def test_worker_reads_the_payload_from_stdin():
    from train_worker import _read_payload

    original = sys.stdin
    try:
        import io

        sys.stdin = io.StringIO('{"prompt": "hello"}')
        assert _read_payload(["train_worker.py", "job-id"]) == {"prompt": "hello"}
    finally:
        sys.stdin = original


def test_worker_still_accepts_an_argv_payload():
    from train_worker import _read_payload

    payload = _read_payload(["train_worker.py", "job-id", '{"prompt": "x"}'])
    assert payload == {"prompt": "x"}


def test_worker_without_a_job_id_exits_non_zero():
    result = subprocess.run(
        [sys.executable, str(BASE_DIR / "train_worker.py")],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=str(BASE_DIR),
    )
    assert result.returncode != 0


def test_worker_marks_a_malformed_payload_as_failed(db_session):
    """End-to-end through a real subprocess, which is what the API does."""
    job_id = str(uuid.uuid4())
    db_session.add(TrainingJob(id=job_id, name="t", prompt="p"))
    db_session.commit()

    result = subprocess.run(
        [sys.executable, str(BASE_DIR / "train_worker.py"), job_id],
        input="this is not json",
        capture_output=True,
        text=True,
        timeout=180,
        cwd=str(BASE_DIR),
    )
    assert result.returncode == 1

    db_session.expire_all()
    job = db_session.get(TrainingJob, job_id)
    assert job.status == JobStatusValue.FAILED
    assert "Malformed job payload" in job.error


def test_spawned_worker_runs_and_fails_the_job_cleanly(db_session, monkeypatch):
    """A real spawn on this platform: the process must start, and the job must
    reach a terminal state rather than sitting in `queued` forever."""
    job_id = str(uuid.uuid4())
    db_session.add(TrainingJob(id=job_id, name="t", prompt="classify reviews"))
    db_session.commit()

    # No ML stack in CI, so training fails — that is the point: it must fail
    # *as a job*, through the worker, not by refusing to spawn.
    result = subprocess.run(
        [sys.executable, str(BASE_DIR / "train_worker.py"), job_id],
        input=json.dumps({"name": "t", "prompt": "classify reviews", "task": "auto"}),
        capture_output=True,
        text=True,
        timeout=300,
        cwd=str(BASE_DIR),
    )
    assert result.returncode == 0, result.stderr

    db_session.expire_all()
    job = db_session.get(TrainingJob, job_id)
    assert job.status in JobStatusValue.TERMINAL


def test_real_spawn_succeeds_on_this_platform(db_session):
    """Calls the API's own spawn helper.

    On POSIX the old implementation raised
    `ValueError: creationflags is only supported on Windows platforms`
    before the worker ever started.
    """
    import time

    from app.schemas import CreateModelRequest

    job_id = str(uuid.uuid4())
    db_session.add(TrainingJob(id=job_id, name="spawn", prompt="classify reviews"))
    db_session.commit()

    _spawn_worker(job_id, CreateModelRequest(name="spawn", prompt="classify reviews", task="auto"))

    # The worker owns the job from here; wait for it to reach a terminal state.
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        db_session.expire_all()
        job = db_session.get(TrainingJob, job_id)
        if job.status in JobStatusValue.TERMINAL:
            break
        time.sleep(0.5)

    assert job.status in JobStatusValue.TERMINAL, f"worker never finished: {job.status}"
