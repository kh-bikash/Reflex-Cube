"""SSE log streaming.

Regression: the old stream looped forever even after the job finished, so every
page visit leaked a connection until the browser gave up.
"""

from __future__ import annotations

import json
import uuid

from app.models import JobStatusValue
from app.utils import append_jsonl, training_log_path

UNKNOWN = "00000000-0000-0000-0000-000000000000"


def _events(payload: str) -> list[dict]:
    """Parse the data frames out of an SSE body."""
    events = []
    for line in payload.splitlines():
        if line.startswith("data: "):
            body = line[len("data: ") :].strip()
            if body and body != "{}":
                events.append(json.loads(body))
    return events


def test_unknown_job_is_404(client):
    assert client.get(f"/api/logs/{UNKNOWN}").status_code == 404


def test_malformed_id_is_400(client):
    assert client.get("/api/logs/not-a-uuid").status_code == 400


def test_stream_replays_the_log_then_ends(client, make_job):
    job_id = str(uuid.uuid4())
    make_job(id=job_id, status=JobStatusValue.COMPLETED)

    log_path = training_log_path(job_id, create=True)
    append_jsonl(log_path, {"stage": "initializing"})
    append_jsonl(log_path, {"stage": "training", "epoch": 1.0, "loss": 0.42})
    append_jsonl(log_path, {"stage": "completed"})

    response = client.get(f"/api/logs/{job_id}")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    # It returned at all: a non-terminating stream would hang here.
    assert [event["stage"] for event in _events(response.text)] == [
        "initializing",
        "training",
        "completed",
    ]
    assert "event: end" in response.text


def test_stream_closes_for_a_failed_job_with_no_log(client, make_job):
    job_id = str(uuid.uuid4())
    make_job(id=job_id, status=JobStatusValue.FAILED, error="boom")

    response = client.get(f"/api/logs/{job_id}")
    assert response.status_code == 200
    assert "event: end" in response.text
    assert any("never appeared" in event.get("error", "") for event in _events(response.text))


def test_caching_is_disabled(client, make_job):
    job_id = str(uuid.uuid4())
    make_job(id=job_id, status=JobStatusValue.COMPLETED)
    training_log_path(job_id, create=True).write_text("", encoding="utf-8")

    response = client.get(f"/api/logs/{job_id}")
    assert response.headers["cache-control"] == "no-cache"
    # Without this, nginx buffers the whole response and defeats streaming.
    assert response.headers["x-accel-buffering"] == "no"
