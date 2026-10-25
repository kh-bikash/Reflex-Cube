"""Training-job lifecycle endpoints."""

from __future__ import annotations

import uuid
import zipfile
from pathlib import Path

import pytest

from app.models import JobStatusValue, TrainingJob
from app.utils import job_dir

UNKNOWN = "00000000-0000-0000-0000-000000000000"


@pytest.fixture
def owned_job(make_job, account):
    """owned_job, but the row belongs to the signed-in test account."""
    profile, _headers = account

    def _make(**overrides):
        overrides.setdefault("user_id", profile["id"])
        return make_job(**overrides)

    return _make


@pytest.fixture
def no_spawn(monkeypatch):
    """Record worker spawns instead of starting a subprocess."""
    from app.routes import models as models_route

    calls = []
    monkeypatch.setattr(models_route, "_spawn_worker", lambda job_id, req: calls.append(job_id))
    return calls


class TestCreate:
    def test_queues_a_job(self, auth_client, no_spawn):
        response = auth_client.post(
            "/api/models/create", json={"name": "demo", "prompt": "classify reviews"}
        )
        assert response.status_code == 202
        body = response.json()
        assert body["status"] == JobStatusValue.QUEUED
        assert uuid.UUID(body["job_id"])
        assert no_spawn == [body["job_id"]]

    def test_the_job_is_then_readable(self, auth_client, no_spawn):
        job_id = auth_client.post(
            "/api/models/create", json={"name": "demo", "prompt": "classify reviews"}
        ).json()["job_id"]
        body = auth_client.get(f"/api/training/status/{job_id}").json()
        assert body["name"] == "demo"
        assert body["status"] == JobStatusValue.QUEUED
        assert body["progress"] == 0

    @pytest.mark.parametrize(
        "payload",
        [
            {"name": "", "prompt": "x"},
            {"name": "x", "prompt": ""},
            {"prompt": "x"},
            {"name": "x"},
            {"name": "x", "prompt": "x", "task": "not-a-task"},
        ],
    )
    def test_invalid_payloads_are_rejected(self, auth_client, no_spawn, payload):
        assert auth_client.post("/api/models/create", json=payload).status_code == 422

    def test_a_spawn_failure_fails_the_job(self, auth_client, monkeypatch):
        """A job must never be left stuck in `queued`."""
        from app.routes import models as models_route

        def boom(job_id, req):
            raise OSError("fork failed")

        monkeypatch.setattr(models_route, "_spawn_worker", boom)
        response = auth_client.post("/api/models/create", json={"name": "d", "prompt": "p"})
        assert response.status_code == 500

        from app.db import SessionLocal

        with SessionLocal() as session:
            job = session.query(TrainingJob).one()
            assert job.status == JobStatusValue.FAILED
            assert "fork failed" in job.error


class TestStatus:
    def test_unknown_job_is_404(self, auth_client):
        assert auth_client.get(f"/api/training/status/{UNKNOWN}").status_code == 404

    def test_malformed_id_is_400(self, auth_client):
        assert auth_client.get("/api/training/status/not-a-uuid").status_code == 400

    def test_metrics_are_exposed(self, auth_client, owned_job):
        job = owned_job(
            status=JobStatusValue.COMPLETED,
            progress=100,
            loss=0.21,
            accuracy=0.93,
            model_name="distilbert-base-uncased",
            dataset_name="imdb",
        )
        body = auth_client.get(f"/api/training/status/{job.id}").json()
        assert body["accuracy"] == 0.93
        assert body["loss"] == 0.21
        assert body["model_name"] == "distilbert-base-uncased"
        assert body["dataset_name"] == "imdb"


class TestListing:
    def test_empty(self, auth_client):
        assert auth_client.get("/api/models/all").json() == []

    def test_newest_first(self, auth_client, owned_job):
        import datetime

        old = owned_job(name="old")
        new = owned_job(name="new")
        old.created_at = datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc)
        new.created_at = datetime.datetime(2030, 1, 1, tzinfo=datetime.timezone.utc)

        from app.db import SessionLocal

        with SessionLocal() as session:
            for job in (old, new):
                session.merge(job)
            session.commit()

        names = [row["name"] for row in auth_client.get("/api/models/all").json()]
        assert names == ["new", "old"]


class TestPredict:
    def test_unknown_job_is_404(self, auth_client):
        assert (
            auth_client.post(f"/api/models/{UNKNOWN}/predict", json={"text": "x"}).status_code
            == 404
        )

    def test_incomplete_job_is_409(self, auth_client, owned_job):
        job = owned_job(status=JobStatusValue.TRAINING)
        response = auth_client.post(f"/api/models/{job.id}/predict", json={"text": "x"})
        assert response.status_code == 409

    def test_empty_text_is_422(self, auth_client, owned_job):
        job = owned_job(status=JobStatusValue.COMPLETED)
        assert (
            auth_client.post(f"/api/models/{job.id}/predict", json={"text": ""}).status_code == 422
        )


class TestDownload:
    def test_incomplete_job_is_409(self, auth_client, owned_job):
        job = owned_job(status=JobStatusValue.TRAINING)
        assert auth_client.get(f"/api/models/download/{job.id}").status_code == 409

    def test_prepare_requires_completion(self, auth_client, owned_job):
        job = owned_job(status=JobStatusValue.TRAINING)
        assert auth_client.post(f"/api/models/download-zip/{job.id}").status_code == 409

    def test_prepare_returns_the_url(self, auth_client, owned_job):
        job = owned_job(status=JobStatusValue.COMPLETED)
        body = auth_client.post(f"/api/models/download-zip/{job.id}").json()
        assert body["url"] == f"/api/models/download/{job.id}"

    def test_archive_contains_the_artefacts(self, auth_client, owned_job):
        job_id = str(uuid.uuid4())
        directory = job_dir(job_id)
        (directory / "config.json").write_text("{}", encoding="utf-8")
        (directory / "tokenizer.json").write_text("{}", encoding="utf-8")
        job = owned_job(id=job_id, status=JobStatusValue.COMPLETED, result_path=str(directory))

        response = auth_client.get(f"/api/models/download/{job.id}")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

        from app.config import STORAGE_PATH

        with zipfile.ZipFile(Path(STORAGE_PATH) / f"{job_id}.zip") as archive:
            assert set(archive.namelist()) >= {"config.json", "tokenizer.json"}

    def test_stream_alias_matches(self, auth_client, owned_job):
        job = owned_job(status=JobStatusValue.TRAINING)
        assert auth_client.get(f"/api/models/download-zip-stream/{job.id}").status_code == 409


class TestDelete:
    def test_removes_row_and_artefacts(self, auth_client, owned_job):
        job_id = str(uuid.uuid4())
        directory = job_dir(job_id)
        (directory / "model.bin").write_text("weights", encoding="utf-8")
        owned_job(id=job_id, status=JobStatusValue.COMPLETED, result_path=str(directory))

        assert auth_client.delete(f"/api/models/{job_id}").json() == {
            "status": "deleted",
            "id": job_id,
        }
        assert not directory.exists()
        assert auth_client.get(f"/api/training/status/{job_id}").status_code == 404

    def test_unknown_job_is_404(self, auth_client):
        assert auth_client.delete(f"/api/models/{UNKNOWN}").status_code == 404

    def test_malformed_id_is_400(self, auth_client):
        assert auth_client.delete("/api/models/..%2F..%2Fetc").status_code in (400, 404)
