"""Path helpers must refuse to build a path from an untrusted job id."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest

from app.config import STORAGE_PATH
from app.utils import (
    append_jsonl,
    cube_dir,
    human_size,
    is_valid_job_id,
    job_dir,
    read_jsonl,
    training_log_path,
)


@pytest.mark.parametrize(
    "job_id",
    [
        "../../etc/passwd",
        "..",
        "/etc/passwd",
        "a/b",
        "abc-123",
        "",
        "job id with spaces",
        "x" * 100,
        "ZZZZZZZZ-0000-0000-0000-000000000000",
    ],
)
def test_rejects_unsafe_job_ids(job_id):
    assert is_valid_job_id(job_id) is False
    with pytest.raises(ValueError):
        job_dir(job_id)


def test_accepts_generated_job_ids():
    job_id = str(uuid.uuid4())
    assert is_valid_job_id(job_id)
    path = job_dir(job_id)
    assert path.is_dir()
    assert path.parent == Path(STORAGE_PATH)


def test_job_dir_stays_inside_storage_root():
    path = job_dir(str(uuid.uuid4())).resolve()
    assert str(path).startswith(str(Path(STORAGE_PATH).resolve()))


def test_training_log_path_names_the_expected_file():
    job_id = str(uuid.uuid4())
    assert training_log_path(job_id).name == "training_log.jsonl"


def test_cube_dir_is_created_under_the_cube_root():
    path = cube_dir("unit-test", "nested")
    assert path.is_dir()
    assert path.name == "nested"


def test_jsonl_roundtrip(tmp_path):
    target = tmp_path / "events.jsonl"
    append_jsonl(target, {"stage": "one"})
    append_jsonl(target, {"stage": "two", "loss": 0.5})
    assert list(read_jsonl(target)) == [
        {"stage": "one"},
        {"stage": "two", "loss": 0.5},
    ]


def test_read_jsonl_skips_malformed_lines(tmp_path):
    target = tmp_path / "events.jsonl"
    target.write_text('{"ok": 1}\nnot json\n\n{"ok": 2}\n', encoding="utf-8")
    assert list(read_jsonl(target)) == [{"ok": 1}, {"ok": 2}]


def test_read_jsonl_on_missing_file_is_empty(tmp_path):
    assert list(read_jsonl(tmp_path / "nope.jsonl")) == []


@pytest.mark.parametrize(
    ("size", "expected"),
    [(0, "0.0 B"), (1536, "1.5 KB"), (1024 * 1024 * 3, "3.0 MB")],
)
def test_human_size(size, expected):
    assert human_size(size) == expected
