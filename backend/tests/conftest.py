"""Shared fixtures.

Every test runs against a throwaway data directory and SQLite file. The
environment is set *before* `app.config` is imported, because that module reads
it at import time and exports the Hugging Face cache variables as a side effect.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_TMP_ROOT = Path(tempfile.mkdtemp(prefix="reflexcube-tests-"))
os.environ.setdefault("REFLEX_DATA_DIR", str(_TMP_ROOT / "data"))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP_ROOT / 'test.db'}")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:8080")
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ.setdefault("BRAIN_EAGER_LOAD", "0")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-hs256-abcdef")

from app.cubes.base import Cube  # noqa: E402
from app.cubes.registry import CubeRegistry  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():
    """Give every test an empty schema.

    One fixture owns the lifecycle. When `client` and `db_session` each reset
    the schema themselves, whichever resolves second wipes the rows the first
    had already created — which silently signed out the test account.
    """
    from app.db import Base, engine, init_db

    Base.metadata.drop_all(bind=engine)
    init_db()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(clean_database):
    """TestClient over a fresh app."""
    from fastapi.testclient import TestClient

    from app.api import create_app

    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def db_session(clean_database):
    """Session against the test's schema."""
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


TEST_EMAIL = "tester@example.com"
TEST_PASSWORD = "correct-horse-battery"


@pytest.fixture
def account(client):
    """Register an account and return (profile, auth headers)."""
    response = client.post(
        "/api/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "display_name": "Tester"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body["user"], {"Authorization": f"Bearer {body['access_token']}"}


@pytest.fixture
def auth_client(client, account):
    """TestClient that sends the test account's token on every request."""
    _profile, headers = account
    client.headers.update(headers)
    return client


@pytest.fixture
def other_account(client):
    """A second account, for checking that users cannot see each other's work."""
    response = client.post(
        "/api/auth/register",
        json={"email": "someone-else@example.com", "password": TEST_PASSWORD},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body["user"], {"Authorization": f"Bearer {body['access_token']}"}


class EchoCube(Cube):
    """Minimal cube used to exercise dispatch without any ML dependency."""

    name = "Echo Cube"
    description = "Returns whatever it is given."

    def run(self, input_data):
        return self.ok(echo=self.as_dict(input_data))


class BoomCube(Cube):
    """Cube that raises, to check the API converts it into an error payload."""

    name = "Boom Cube"
    description = "Always raises."

    def run(self, input_data):
        raise RuntimeError("cube exploded")


class PlainCube(Cube):
    """Cube that returns a non-dict, to check the API wraps it."""

    name = "Plain Cube"
    description = "Returns a bare string."

    def run(self, input_data):
        return "just a string"


@pytest.fixture
def stub_registry():
    """Install stub cubes on the shared registry and restore it afterwards."""
    from app.cubes import registry as registry_module

    original = registry_module.registry
    stub = CubeRegistry(specs=())
    stub.register("echo", EchoCube())
    stub.register("boom", BoomCube())
    stub.register("plain", PlainCube())
    registry_module.registry = stub

    # The route module imported `registry` by value at import time.
    from app.routes import cubes as cubes_route
    from app.routes import system as system_route

    cubes_route.registry = stub
    system_route.registry = stub
    try:
        yield stub
    finally:
        registry_module.registry = original
        cubes_route.registry = original
        system_route.registry = original


@pytest.fixture
def make_job(db_session):
    """Factory inserting a TrainingJob row.

    Pass `user_id` to attribute it to an account; unowned jobs are visible to
    any caller, which is the single-user local case.
    """
    import uuid

    from app.models import TrainingJob

    def _make(**overrides):
        job = TrainingJob(
            id=overrides.pop("id", str(uuid.uuid4())),
            name=overrides.pop("name", "test-model"),
            prompt=overrides.pop("prompt", "classify movie reviews"),
            **overrides,
        )
        db_session.add(job)
        db_session.commit()
        return job

    return _make


@pytest.fixture(autouse=True)
def no_outbound_network(monkeypatch, request):
    """Fail any test that reaches the public internet.

    Several cubes call hosted inference endpoints through `utils.ai_router`.
    Left alone they make real HTTP requests during the suite, which is slow,
    flaky and dependent on someone else's uptime. Mark a test with
    `@pytest.mark.network` to opt out.

    `socket.socket.connect` is the chokepoint every client library reaches
    eventually, including urllib3, which bypasses `socket.create_connection`.
    """
    if request.node.get_closest_marker("network"):
        return

    import socket

    local_hosts = {"localhost", "127.0.0.1", "::1", "testserver", ""}
    real_connect = socket.socket.connect

    def guarded_connect(self, address, *args, **kwargs):
        host = address[0] if isinstance(address, tuple) else address
        if isinstance(host, str) and host not in local_hosts:
            raise RuntimeError(
                f"Blocked outbound connection to {host}. "
                "Stub the call, or mark the test with @pytest.mark.network."
            )
        return real_connect(self, address, *args, **kwargs)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)

    # A configured HTTP(S) proxy terminates on localhost, which the socket
    # guard allows, so block at the client layer as well.
    try:
        import requests
    except ImportError:  # pragma: no cover - requests is a core dependency
        return

    def guarded_request(self, method, url, *args, **kwargs):
        raise RuntimeError(
            f"Blocked outbound connection to {url}. "
            "Stub the call, or mark the test with @pytest.mark.network."
        )

    monkeypatch.setattr(requests.Session, "request", guarded_request)
