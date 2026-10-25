"""ReflexBrain must stay lazy and degrade cleanly."""

from __future__ import annotations

import pytest

from app.brain import BrainUnavailable, ReflexBrain, _build_prompt, _coerce_request, get_brain


def test_importing_does_not_load_a_model():
    """Regression: the module used to build a 2B model at import time, so
    importing the API downloaded gigabytes before serving a single request."""
    brain = ReflexBrain()
    assert brain.model is None
    assert brain._loaded is False


def test_status_does_not_trigger_a_load():
    brain = ReflexBrain()
    status = brain.status()
    assert status["loaded"] is False
    assert status["ready"] is False
    assert status["model_id"]


def test_get_brain_is_a_singleton():
    assert get_brain() is get_brain()


def test_generate_raises_when_unavailable(monkeypatch):
    brain = ReflexBrain()
    monkeypatch.setattr(brain, "_load", lambda: (_ for _ in ()).throw(ImportError("no torch")))
    with pytest.raises(BrainUnavailable):
        brain.generate("hello")


def test_load_failure_is_attempted_once(monkeypatch):
    brain = ReflexBrain()
    calls = []

    def failing_load():
        calls.append(1)
        raise ImportError("no torch")

    monkeypatch.setattr(brain, "_load", failing_load)
    assert brain.ensure_loaded() is False
    assert brain.ensure_loaded() is False
    assert len(calls) == 1
    assert "no torch" in brain.load_error


def test_memory_helpers_are_safe_without_a_model(monkeypatch):
    brain = ReflexBrain()
    monkeypatch.setattr(brain, "_load", lambda: (_ for _ in ()).throw(ImportError("no torch")))
    assert brain.remember("fact") is False
    assert brain.recall("fact") == []


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ("plain string", "plain string"),
        ({"text": "from text"}, "from text"),
        ({"query": "from query"}, "from query"),
        ({"prompt": "from prompt"}, "from prompt"),
        ({"message": "from message"}, "from message"),
    ],
)
def test_request_coercion(payload, expected):
    assert _coerce_request(payload) == expected


def test_structured_payload_without_a_text_field_is_serialised():
    assert _coerce_request({"a": 1}) == '{"a": 1}'


def test_prompt_names_the_cube_and_the_request():
    prompt = _build_prompt("research", "solid-state batteries")
    assert "research" in prompt
    assert "solid-state batteries" in prompt


def test_sandbox_is_skipped_without_credentials(monkeypatch):
    import app.brain as brain_module

    monkeypatch.setattr(brain_module, "E2B_API_KEY", None)
    results = ReflexBrain()._run_sandbox(["print(1)"])
    assert "E2B_API_KEY" in results[0]["error"]


def test_credentials_are_not_interpolated_into_generated_code():
    """Keys go in as sandbox env vars, so they cannot leak into a traceback,
    the next prompt, or the report."""
    import inspect

    source = inspect.getsource(ReflexBrain._run_sandbox)
    assert "envs=env_vars" in source
    assert "os.environ['SERPAPI_API_KEY']='" not in source
