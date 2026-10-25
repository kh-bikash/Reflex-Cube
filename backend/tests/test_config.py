"""Configuration must be environment-driven and cross-platform."""

from __future__ import annotations

import importlib
import os
from pathlib import Path

import pytest


def _reload_config(monkeypatch, **env):
    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    import app.config

    return importlib.reload(app.config)


def test_paths_are_absolute_and_exist():
    from app import config

    for path in (config.STORAGE_PATH, config.CUBE_STORAGE_PATH, str(config.HF_HOME)):
        assert Path(path).is_absolute()
        assert Path(path).is_dir()


def test_no_hardcoded_windows_drive_letters():
    """Regression: these used to be pinned to `D:\\ReflexCubeData`."""
    source = Path(__file__).resolve().parent.parent / "app" / "config.py"
    text = source.read_text(encoding="utf-8")
    assert "D:\\" not in text
    assert "d:\\" not in text.lower() or "d:\\" not in text


def test_storage_path_honours_env(monkeypatch, tmp_path):
    target = tmp_path / "custom-models"
    config = _reload_config(monkeypatch, STORAGE_PATH=str(target))
    try:
        assert Path(config.STORAGE_PATH) == target.resolve()
        assert target.is_dir()
    finally:
        _reload_config(monkeypatch, STORAGE_PATH=None)


def test_hf_cache_env_is_exported():
    from app import config

    config.ensure_directories()
    assert os.environ["HF_HOME"]
    assert os.environ["HF_DATASETS_CACHE"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [("1", True), ("true", True), ("YES", True), ("0", False), ("off", False)],
)
def test_bool_from_env(monkeypatch, value, expected):
    from app.config import _bool_from_env

    monkeypatch.setenv("REFLEX_TEST_FLAG", value)
    assert _bool_from_env("REFLEX_TEST_FLAG") is expected


def test_credentials_disabled_for_wildcard_cors(monkeypatch):
    """`Allow-Origin: *` with credentials is rejected by browsers."""
    config = _reload_config(monkeypatch, CORS_ORIGINS="*")
    try:
        assert config.CORS_ORIGINS == ["*"]
        assert config.ALLOW_CREDENTIALS is False
    finally:
        _reload_config(monkeypatch, CORS_ORIGINS=None)


def test_credentials_enabled_for_explicit_origins(monkeypatch):
    config = _reload_config(monkeypatch, CORS_ORIGINS="http://a.example, http://b.example")
    try:
        assert config.CORS_ORIGINS == ["http://a.example", "http://b.example"]
        assert config.ALLOW_CREDENTIALS is True
    finally:
        _reload_config(monkeypatch, CORS_ORIGINS=None)
