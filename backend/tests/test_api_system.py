"""Root, health, newsletter, PDF and CORS behaviour."""

from __future__ import annotations

import pytest

from app import __version__


def test_root_reports_the_service(client):
    body = client.get("/").json()
    assert body["status"] == "ok"
    assert body["version"] == __version__


def test_health_reports_dependencies(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["cubes"] >= 1
    assert body["storage_path"]


def test_openapi_schema_is_served(client):
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    for path in (
        "/api/health",
        "/api/models/create",
        "/api/cubes/run",
        "/api/logs/{job_id}",
        "/api/newsletter/subscribe",
    ):
        assert path in paths, f"{path} missing from the OpenAPI schema"


class TestNewsletter:
    def test_subscribe(self, client):
        body = client.post("/api/newsletter/subscribe", json={"email": "reader@example.com"}).json()
        assert body == {"status": "subscribed", "email": "reader@example.com"}

    def test_resubscribe_is_idempotent(self, client):
        client.post("/api/newsletter/subscribe", json={"email": "r@example.com"})
        body = client.post("/api/newsletter/subscribe", json={"email": "r@example.com"}).json()
        assert body["status"] == "already_subscribed"

    def test_email_is_normalised(self, client):
        client.post("/api/newsletter/subscribe", json={"email": "Mixed@Example.COM"})
        body = client.post("/api/newsletter/subscribe", json={"email": "mixed@example.com"}).json()
        assert body["status"] == "already_subscribed"

    @pytest.mark.parametrize("email", ["not-an-email", "", "a@", "@b.com"])
    def test_invalid_email_is_rejected(self, client, email):
        assert client.post("/api/newsletter/subscribe", json={"email": email}).status_code == 422


class TestPdfExport:
    def test_renders_a_pdf(self, client):
        response = client.post(
            "/api/cubes/pdf", json={"title": "Quarterly", "markdown": "# Hello\n\ntext"}
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")

    def test_filename_is_sanitised(self, client):
        response = client.post(
            "/api/cubes/pdf",
            json={"title": 'Report/../../etc "weird"', "markdown": "# x"},
        )
        disposition = response.headers["content-disposition"]
        assert "/" not in disposition.split("filename=")[1]
        assert ".." not in disposition

    def test_title_is_html_escaped(self, client):
        """The title is interpolated into the HTML template."""
        response = client.post(
            "/api/cubes/pdf",
            json={"title": "<script>alert(1)</script>", "markdown": "# x"},
        )
        assert response.status_code == 200

    def test_empty_body_is_rejected(self, client):
        assert client.post("/api/cubes/pdf", json={"title": "", "markdown": ""}).status_code == 422


class TestCors:
    def test_allows_the_configured_origin(self, client):
        response = client.get("/api/health", headers={"Origin": "http://localhost:8080"})
        assert response.headers.get("access-control-allow-origin") == "http://localhost:8080"

    def test_does_not_echo_an_unconfigured_origin(self, client):
        response = client.get("/api/health", headers={"Origin": "http://evil.example"})
        assert response.headers.get("access-control-allow-origin") != "http://evil.example"

    def test_preflight_is_answered(self, client):
        response = client.options(
            "/api/cubes/run",
            headers={
                "Origin": "http://localhost:8080",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.status_code == 200
