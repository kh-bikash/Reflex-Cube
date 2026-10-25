"""Cube catalog and dispatch.

The central regression here: `/api/cubes/run` must dispatch through the
registry. It previously routed every request to the agent loop, so the cube
implementations were unreachable and consoles received a string where they
expected their own payload.
"""

from __future__ import annotations

import pytest


class TestCatalog:
    def test_lists_cubes(self, client):
        body = client.get("/api/cubes").json()
        assert body["count"] == len(body["cubes"]) >= 16
        assert {"id", "name", "description"} <= set(body["cubes"][0])

    def test_trailing_slash_also_works(self, client):
        assert client.get("/api/cubes/").status_code == 200

    def test_single_cube(self, client):
        body = client.get("/api/cubes/forge").json()
        assert body["id"] == "forge"

    def test_unknown_cube_is_404(self, client):
        assert client.get("/api/cubes/nope").status_code == 404


class TestDispatch:
    def test_registry_cube_payload_is_returned_verbatim(self, client, stub_registry):
        body = client.post(
            "/api/cubes/run", json={"cube_id": "echo", "input": {"text": "hi"}}
        ).json()
        assert body == {"status": "success", "echo": {"text": "hi"}}

    def test_string_input_is_coerced(self, client, stub_registry):
        body = client.post("/api/cubes/run", json={"cube_id": "echo", "input": "hi"}).json()
        assert body["echo"] == {"text": "hi"}

    def test_null_input_is_accepted(self, client, stub_registry):
        body = client.post("/api/cubes/run", json={"cube_id": "echo"}).json()
        assert body["echo"] == {}

    def test_cube_id_is_case_insensitive(self, client, stub_registry):
        assert (
            client.post("/api/cubes/run", json={"cube_id": "ECHO", "input": "x"}).status_code == 200
        )

    def test_a_raising_cube_becomes_an_error_payload(self, client, stub_registry):
        response = client.post("/api/cubes/run", json={"cube_id": "boom", "input": {}})
        # 200 with an error body: every console renders this shape.
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "error"
        assert "cube exploded" in body["message"]

    def test_non_dict_return_is_wrapped(self, client, stub_registry):
        body = client.post("/api/cubes/run", json={"cube_id": "plain", "input": {}}).json()
        assert body == {"status": "success", "result": "just a string"}

    def test_missing_cube_id_is_422(self, client):
        assert client.post("/api/cubes/run", json={"input": "x"}).status_code == 422

    def test_blank_cube_id_is_422(self, client):
        assert client.post("/api/cubes/run", json={"cube_id": "", "input": "x"}).status_code == 422


class TestAgentFallback:
    """Cubes with no Python implementation go to the agent loop."""

    def test_unregistered_cube_uses_the_agent(self, client, stub_registry, monkeypatch):
        import app.brain as brain_module

        class FakeBrain:
            def run_agent(self, payload, cube_id):
                return f"# Report for {cube_id}"

        monkeypatch.setattr(brain_module, "get_brain", lambda: FakeBrain())
        body = client.post(
            "/api/cubes/run", json={"cube_id": "research", "input": "quantum"}
        ).json()
        assert body == {"status": "success", "result": "# Report for research"}

    def test_unavailable_agent_is_503_not_a_crash(self, client, stub_registry, monkeypatch):
        import app.brain as brain_module

        class DeadBrain:
            def run_agent(self, payload, cube_id):
                raise brain_module.BrainUnavailable("torch is not installed")

        monkeypatch.setattr(brain_module, "get_brain", lambda: DeadBrain())
        response = client.post("/api/cubes/run", json={"cube_id": "research", "input": "x"})
        assert response.status_code == 503
        assert "torch is not installed" in response.json()["detail"]

    def test_a_cube_that_failed_to_import_is_503(self, client, monkeypatch):
        """A broken cube must not silently fall through to the agent."""
        from app.cubes.registry import CubeRegistry, CubeSpec
        from app.routes import cubes as cubes_route

        broken = CubeRegistry(specs=(CubeSpec("ghost", "no_such_module", "Ghost", "Ghost", "n/a"),))
        monkeypatch.setattr(cubes_route, "registry", broken)

        response = client.post("/api/cubes/run", json={"cube_id": "ghost", "input": {}})
        assert response.status_code == 503
        assert "failed to load" in response.json()["detail"]


@pytest.mark.parametrize(
    "cube_id",
    [
        "forge",
        "vision",
        "dream",
        "chef",
        "alpha",
        "nexus",
        "lens",
        "sentinel",
        "legal",
        "ledger",
        "talent",
        "career",
        "brand",
        "fitpal",
        "travel",
        "legacy",
    ],
)
def test_every_declared_cube_is_addressable(client, cube_id):
    assert client.get(f"/api/cubes/{cube_id}").status_code == 200
