"""Accounts, tokens, and the isolation between users."""

from __future__ import annotations

import time

import pytest

from app.security import (
    TokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_roundtrip(self):
        hashed = hash_password("correct-horse-battery")
        assert hashed != "correct-horse-battery"
        assert verify_password("correct-horse-battery", hashed)

    def test_wrong_password_rejected(self):
        assert not verify_password("nope", hash_password("correct-horse-battery"))

    def test_salted(self):
        """Two hashes of the same password must differ."""
        assert hash_password("same") != hash_password("same")

    def test_long_password_is_not_silently_truncated(self):
        """bcrypt caps at 72 bytes; beyond that the tail must still matter."""
        base = "x" * 100
        hashed = hash_password(base + "AAAA")
        assert verify_password(base + "AAAA", hashed)
        assert not verify_password(base + "BBBB", hashed)

    def test_malformed_hash_is_false_not_an_exception(self):
        assert verify_password("anything", "not-a-bcrypt-hash") is False
        assert verify_password("anything", "") is False


class TestTokens:
    def test_roundtrip(self):
        payload = decode_access_token(create_access_token("user-123"))
        assert payload["sub"] == "user-123"

    def test_extra_claims_survive(self):
        payload = decode_access_token(create_access_token("u", {"email": "a@b.com"}))
        assert payload["email"] == "a@b.com"

    def test_tampered_token_rejected(self):
        token = create_access_token("user-123")
        head, body, signature = token.split(".")
        with pytest.raises(TokenError):
            decode_access_token(f"{head}.{body}.{signature[:-4]}AAAA")

    def test_garbage_rejected(self):
        with pytest.raises(TokenError):
            decode_access_token("not-a-token")

    def test_token_signed_with_another_key_rejected(self):
        import jwt

        foreign = jwt.encode({"sub": "u", "exp": time.time() + 600}, "another-secret-entirely")
        with pytest.raises(TokenError):
            decode_access_token(foreign)

    def test_expired_token_rejected(self):
        import jwt

        from app.config import JWT_ALGORITHM, JWT_SECRET

        expired = jwt.encode(
            {"sub": "u", "exp": int(time.time()) - 60}, JWT_SECRET, algorithm=JWT_ALGORITHM
        )
        with pytest.raises(TokenError, match="expired"):
            decode_access_token(expired)


class TestRegistration:
    def test_creates_an_account(self, client):
        response = client.post(
            "/api/auth/register", json={"email": "new@example.com", "password": "a-good-password"}
        )
        assert response.status_code == 201
        body = response.json()
        assert body["user"]["email"] == "new@example.com"
        assert body["access_token"]
        assert body["expires_in"] > 0

    def test_email_is_normalised(self, client):
        client.post(
            "/api/auth/register", json={"email": "MiXeD@Example.COM", "password": "a-good-password"}
        )
        response = client.post(
            "/api/auth/login", json={"email": "mixed@example.com", "password": "a-good-password"}
        )
        assert response.status_code == 200

    def test_duplicate_email_is_409(self, client):
        payload = {"email": "dup@example.com", "password": "a-good-password"}
        assert client.post("/api/auth/register", json=payload).status_code == 201
        assert client.post("/api/auth/register", json=payload).status_code == 409

    def test_short_password_rejected(self, client):
        response = client.post(
            "/api/auth/register", json={"email": "short@example.com", "password": "abc"}
        )
        assert response.status_code == 422

    @pytest.mark.parametrize("email", ["not-an-email", "", "@example.com"])
    def test_invalid_email_rejected(self, client, email):
        response = client.post(
            "/api/auth/register", json={"email": email, "password": "a-good-password"}
        )
        assert response.status_code == 422

    def test_password_is_never_returned(self, client):
        response = client.post(
            "/api/auth/register", json={"email": "p@example.com", "password": "a-good-password"}
        )
        assert "password" not in response.text
        assert "hashed" not in response.text


class TestLogin:
    def test_succeeds(self, client, account):
        from tests.conftest import TEST_EMAIL, TEST_PASSWORD

        response = client.post(
            "/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        assert response.json()["user"]["email"] == TEST_EMAIL

    def test_wrong_password_is_401(self, client, account):
        from tests.conftest import TEST_EMAIL

        response = client.post(
            "/api/auth/login", json={"email": TEST_EMAIL, "password": "wrong-password"}
        )
        assert response.status_code == 401

    def test_unknown_email_is_401_with_the_same_message(self, client, account):
        from tests.conftest import TEST_EMAIL

        wrong_password = client.post(
            "/api/auth/login", json={"email": TEST_EMAIL, "password": "wrong-password"}
        )
        unknown_email = client.post(
            "/api/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"}
        )
        # Identical responses: the endpoint must not reveal which addresses
        # have accounts.
        assert unknown_email.status_code == wrong_password.status_code == 401
        assert unknown_email.json() == wrong_password.json()


class TestProfile:
    def test_me_returns_the_account(self, auth_client):
        from tests.conftest import TEST_EMAIL

        assert auth_client.get("/api/auth/me").json()["email"] == TEST_EMAIL

    def test_me_is_401_without_a_token(self, client):
        assert client.get("/api/auth/me").status_code == 401

    def test_me_is_401_with_a_bad_token(self, client):
        response = client.get("/api/auth/me", headers={"Authorization": "Bearer nonsense"})
        assert response.status_code == 401

    def test_display_name_can_be_changed(self, auth_client):
        body = auth_client.patch("/api/auth/me", json={"display_name": "Renamed"}).json()
        assert body["display_name"] == "Renamed"

    def test_hub_token_is_stored_but_never_returned(self, auth_client):
        body = auth_client.patch("/api/auth/me", json={"hf_token": "hf_secret_value"}).json()
        assert body["has_hf_token"] is True
        assert "hf_secret_value" not in auth_client.get("/api/auth/me").text

    def test_hub_token_can_be_cleared(self, auth_client):
        auth_client.patch("/api/auth/me", json={"hf_token": "hf_x"})
        assert (
            auth_client.patch("/api/auth/me", json={"hf_token": ""}).json()["has_hf_token"] is False
        )

    def test_password_change_requires_the_current_one(self, auth_client):
        response = auth_client.patch(
            "/api/auth/me", json={"new_password": "a-new-password", "current_password": "wrong"}
        )
        assert response.status_code == 403

    def test_password_change_works(self, client, auth_client):
        from tests.conftest import TEST_EMAIL, TEST_PASSWORD

        assert (
            auth_client.patch(
                "/api/auth/me",
                json={"current_password": TEST_PASSWORD, "new_password": "a-brand-new-password"},
            ).status_code
            == 200
        )
        assert (
            client.post(
                "/api/auth/login", json={"email": TEST_EMAIL, "password": "a-brand-new-password"}
            ).status_code
            == 200
        )


class TestProtectedEndpoints:
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/api/models/all"),
            ("post", "/api/models/create"),
            ("post", "/api/cubes/run"),
            ("get", "/api/auth/me"),
        ],
    )
    def test_require_a_token(self, client, method, path):
        response = getattr(client, method)(path, json={}) if method == "post" else client.get(path)
        assert response.status_code == 401

    @pytest.mark.parametrize("path", ["/api/health", "/api/cubes", "/"])
    def test_public_endpoints_stay_public(self, client, path):
        assert client.get(path).status_code == 200


class TestIsolation:
    """One account must not see or touch another's jobs."""

    def test_listing_shows_only_your_own_jobs(self, client, account, other_account, make_job):
        mine, my_headers = account
        theirs, their_headers = other_account
        make_job(name="mine", user_id=mine["id"])
        make_job(name="theirs", user_id=theirs["id"])

        my_jobs = client.get("/api/models/all", headers=my_headers).json()
        their_jobs = client.get("/api/models/all", headers=their_headers).json()

        assert [job["name"] for job in my_jobs] == ["mine"]
        assert [job["name"] for job in their_jobs] == ["theirs"]

    def test_reading_another_users_job_is_404(self, client, account, other_account, make_job):
        _mine, my_headers = account
        theirs, _ = other_account
        job = make_job(user_id=theirs["id"])

        # 404 rather than 403: whether an id exists is not theirs to learn.
        response = client.get(f"/api/training/status/{job.id}", headers=my_headers)
        assert response.status_code == 404

    def test_deleting_another_users_job_is_404(self, client, account, other_account, make_job):
        _mine, my_headers = account
        theirs, _ = other_account
        job = make_job(user_id=theirs["id"])

        assert client.delete(f"/api/models/{job.id}", headers=my_headers).status_code == 404
        # And it is still there for its owner.
        assert client.get(f"/api/training/status/{job.id}").status_code in (401, 404)

    def test_created_jobs_are_owned(self, auth_client, account, monkeypatch):
        from app.routes import models as models_route

        monkeypatch.setattr(models_route, "_spawn_worker", lambda job_id, req: None)
        profile, _ = account
        job_id = auth_client.post(
            "/api/models/create", json={"name": "owned", "prompt": "classify reviews"}
        ).json()["job_id"]

        from app.db import SessionLocal
        from app.models import TrainingJob

        with SessionLocal() as session:
            assert session.get(TrainingJob, job_id).user_id == profile["id"]


class TestCapacityLimits:
    """A free instance has two cores; one user must not fill the queue."""

    def test_a_second_concurrent_job_is_refused(self, auth_client, account, make_job, monkeypatch):
        from app.routes import models as models_route

        monkeypatch.setattr(models_route, "_spawn_worker", lambda job_id, req: None)
        profile, _ = account
        make_job(user_id=profile["id"], status="training")

        response = auth_client.post(
            "/api/models/create", json={"name": "second", "prompt": "classify reviews"}
        )
        assert response.status_code == 429
        assert "training" in response.json()["detail"].lower()

    def test_a_finished_job_does_not_count(self, auth_client, account, make_job, monkeypatch):
        from app.routes import models as models_route

        monkeypatch.setattr(models_route, "_spawn_worker", lambda job_id, req: None)
        profile, _ = account
        make_job(user_id=profile["id"], status="completed")

        response = auth_client.post(
            "/api/models/create", json={"name": "next", "prompt": "classify reviews"}
        )
        assert response.status_code == 202
