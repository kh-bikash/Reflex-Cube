"""Contract checks across the real cube implementations.

Cubes that need the heavy ML stack are skipped when it is absent, so this file
is meaningful both in a slim CI image and in a full install.
"""

from __future__ import annotations

import pytest

from app.cubes.base import Cube
from app.cubes.registry import CUBE_SPECS, registry

ALL_IDS = [spec.cube_id for spec in CUBE_SPECS]


def _load_or_skip(cube_id: str) -> Cube:
    cube = registry.get_cube(cube_id)
    if cube is None:
        pytest.skip(f"{cube_id} unavailable: {registry.errors().get(cube_id)}")
    return cube


@pytest.mark.parametrize("cube_id", ALL_IDS)
def test_cube_satisfies_the_contract(cube_id):
    cube = _load_or_skip(cube_id)
    assert isinstance(cube, Cube)
    assert isinstance(cube.name, str) and cube.name
    assert isinstance(cube.description, str) and cube.description
    assert callable(cube.run)


@pytest.mark.parametrize("cube_id", ALL_IDS)
def test_cube_returns_a_dict_for_empty_input(cube_id):
    """No cube may raise on a missing field; it returns an error payload."""
    cube = _load_or_skip(cube_id)
    try:
        result = cube.run({})
    except Exception as exc:
        pytest.fail(f"{cube_id}.run({{}}) raised {type(exc).__name__}: {exc}")
    assert isinstance(result, dict), f"{cube_id}.run() returned {type(result).__name__}"
    assert result.get("status") in {"success", "error", None}


def test_sentinel_lists_waf_rules():
    cube = _load_or_skip("sentinel")
    result = cube.run({"action": "get_rules"})
    assert result["status"] == "success"
    assert isinstance(result["data"], list)
    assert result["data"]


def test_ledger_scores_an_empty_audit():
    cube = _load_or_skip("ledger")
    result = cube.run({"action": "audit", "invoices": "", "bank_feed": ""})
    assert result["status"] == "success"
    assert "audit_score" in result["data"]


def test_cubes_do_not_write_to_the_working_directory():
    """Regression: several cubes built paths like `storage/forge_models`,
    so artefacts landed wherever the server happened to be started."""
    import pathlib

    offenders = []
    for path in pathlib.Path("app/cubes").glob("*.py"):
        text = path.read_text(encoding="utf-8")
        if 'os.path.join("storage"' in text or '"storage/' in text:
            offenders.append(path.name)
    assert offenders == []


def test_registry_ids_match_the_frontend_catalog():
    """`frontend/src/lib/cubes.ts` dispatches on these ids."""
    import pathlib
    import re

    catalog = pathlib.Path("../frontend/src/lib/cubes.ts")
    if not catalog.exists():
        pytest.skip("frontend sources not present")

    frontend_ids = set(re.findall(r'^\s+id: "([a-z]+)",', catalog.read_text(), re.MULTILINE))
    backend_ids = set(ALL_IDS)

    # The frontend also lists agent-backed cubes that have no Python module.
    agent_only = frontend_ids - backend_ids
    assert agent_only <= {"research", "social"}, f"unknown frontend cubes: {agent_only}"

    missing_consoles = backend_ids - frontend_ids
    assert not missing_consoles, f"registered cubes with no console: {missing_consoles}"
