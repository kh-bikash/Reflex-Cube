"""The cube registry must be lazy, fault-tolerant and complete."""

from __future__ import annotations

from app.cubes.base import Cube
from app.cubes.registry import CUBE_SPECS, CubeRegistry, CubeSpec, registry


class _Stub(Cube):
    name = "Stub"
    description = "stub"

    def run(self, input_data):
        return self.ok()


def test_catalog_lists_every_declared_cube():
    listing = registry.list_cubes()
    assert {entry["id"] for entry in listing} == {spec.cube_id for spec in CUBE_SPECS}
    assert len(listing) == 16


def test_catalog_entries_are_fully_described():
    for entry in registry.list_cubes():
        assert entry["id"] and entry["name"] and entry["description"]


def test_cube_ids_are_unique():
    ids = [spec.cube_id for spec in CUBE_SPECS]
    assert len(ids) == len(set(ids))


def test_dream_and_legacy_are_registered():
    """Regression: both cubes existed but were missing from the old registry."""
    ids = {spec.cube_id for spec in CUBE_SPECS}
    assert {"dream", "legacy"} <= ids


def test_listing_does_not_import_cubes():
    """The catalog must be answerable without the heavy ML stack installed."""
    fresh = CubeRegistry()
    fresh.list_cubes()
    assert fresh.errors() == {}
    assert fresh._instances == {}


def test_unknown_cube_returns_none():
    fresh = CubeRegistry()
    assert fresh.get_cube("does-not-exist") is None
    assert fresh.has("does-not-exist") is False


def test_import_failure_is_recorded_not_raised():
    fresh = CubeRegistry(specs=(CubeSpec("broken", "no_such_module", "Nope", "Broken", "n/a"),))
    assert fresh.get_cube("broken") is None
    assert "broken" in fresh.errors()
    assert "ModuleNotFoundError" in fresh.errors()["broken"]


def test_import_is_attempted_once():
    fresh = CubeRegistry(specs=(CubeSpec("broken", "no_such_module", "Nope", "Broken", "n/a"),))
    fresh.get_cube("broken")
    first = fresh.errors()["broken"]
    fresh.get_cube("broken")
    assert fresh.errors()["broken"] == first


def test_registered_instance_wins_over_declaration():
    fresh = CubeRegistry()
    stub = _Stub()
    fresh.register("chef", stub)
    assert fresh.get_cube("chef") is stub


def test_runtime_registration_appears_in_the_catalog():
    fresh = CubeRegistry(specs=())
    fresh.register("extra", _Stub())
    assert [entry["id"] for entry in fresh.list_cubes()] == ["extra"]


def test_preload_reports_both_outcomes():
    fresh = CubeRegistry(specs=(CubeSpec("broken", "no_such_module", "Nope", "Broken", "n/a"),))
    fresh.register("ok", _Stub())
    result = fresh.preload()
    assert result["loaded"] == []
    assert "broken" in result["failed"]


def test_base_cube_helpers():
    stub = _Stub()
    assert stub.ok(value=1) == {"status": "success", "value": 1}
    assert stub.fail("nope") == {"status": "error", "message": "nope"}
    assert stub.as_dict({"a": 1}) == {"a": 1}
    assert stub.as_dict("hello") == {"text": "hello"}
    assert stub.as_dict(None) == {}
