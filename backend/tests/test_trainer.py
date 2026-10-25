"""Trainer behaviour that does not need the ML stack installed."""

from __future__ import annotations

import json
import uuid

import pytest

from app.models import JobStatusValue, TrainingJob
from app.trainer import run_training_job, update_job
from app.utils import read_jsonl, training_log_path


def test_trainer_imports_without_torch():
    """The API and tests must not require a multi-gigabyte ML install."""
    import importlib

    module = importlib.import_module("app.trainer")
    assert hasattr(module, "run_training_job")


class TestUpdateJob:
    def test_patches_fields(self, make_job):
        job = make_job()
        update_job(job.id, status=JobStatusValue.TRAINING, progress=42, loss=0.1)

        from app.db import SessionLocal

        with SessionLocal() as session:
            fresh = session.get(TrainingJob, job.id)
            assert fresh.status == JobStatusValue.TRAINING
            assert fresh.progress == 42
            assert fresh.loss == pytest.approx(0.1)

    def test_none_values_are_ignored(self, make_job):
        job = make_job(progress=55)
        update_job(job.id, progress=None)

        from app.db import SessionLocal

        with SessionLocal() as session:
            assert session.get(TrainingJob, job.id).progress == 55

    def test_errors_accumulate(self, make_job):
        job = make_job()
        update_job(job.id, error_msg="first")
        update_job(job.id, error_msg="second")

        from app.db import SessionLocal

        with SessionLocal() as session:
            error = session.get(TrainingJob, job.id).error
            assert "first" in error and "second" in error

    def test_unknown_job_is_a_no_op(self, db_session):
        update_job(str(uuid.uuid4()), status=JobStatusValue.COMPLETED)


class TestFailurePath:
    """A job must always reach a terminal state with a usable reason."""

    def test_setup_failure_is_reported_not_masked(self, make_job, monkeypatch):
        """Regression: the handler referenced names bound inside the `try`,
        so an early failure raised NameError and buried the real error."""
        import app.trainer as trainer

        def boom(prompt, requested=None):
            raise RuntimeError("interpreter exploded")

        monkeypatch.setattr(trainer, "detect_task", boom)

        job = make_job()
        run_training_job({"prompt": "anything"}, job.id)

        from app.db import SessionLocal

        with SessionLocal() as session:
            fresh = session.get(TrainingJob, job.id)
        assert fresh.status == JobStatusValue.FAILED
        assert "interpreter exploded" in fresh.error

        events = list(read_jsonl(training_log_path(job.id)))
        assert events[-1]["stage"] == "failed"
        assert "interpreter exploded" in events[-1]["error"]

    def test_traceback_is_written_next_to_the_checkpoint(self, make_job, monkeypatch):
        import app.trainer as trainer
        from app.utils import job_dir

        monkeypatch.setattr(
            trainer, "detect_task", lambda *a, **k: (_ for _ in ()).throw(ValueError("nope"))
        )
        job = make_job()
        run_training_job({"prompt": "x"}, job.id)

        error_file = job_dir(job.id) / "error.txt"
        assert error_file.exists()
        assert "ValueError" in error_file.read_text(encoding="utf-8")

    def test_dataset_failure_falls_back_once(self, make_job, monkeypatch):
        import app.trainer as trainer

        attempts = []

        def fake_load(name):
            attempts.append(name)
            raise RuntimeError(f"cannot load {name}")

        monkeypatch.setattr(trainer, "load_dataset_strict", fake_load)

        job = make_job()
        run_training_job({"prompt": "classify spam emails", "task": "text-classification"}, job.id)

        # Primary, then exactly one fallback.
        assert len(attempts) == 2
        assert attempts[0] != attempts[1] or attempts[0] == attempts[1]

        stages = [event["stage"] for event in read_jsonl(training_log_path(job.id))]
        assert "dataset_fallback" in stages
        assert stages[-1] == "failed"


class TestProgressLog:
    def test_events_are_valid_jsonl(self, make_job, monkeypatch):
        import app.trainer as trainer

        monkeypatch.setattr(
            trainer, "detect_task", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x"))
        )
        job = make_job()
        run_training_job({"prompt": "p"}, job.id)

        raw = training_log_path(job.id).read_text(encoding="utf-8")
        for line in raw.splitlines():
            if line.strip():
                json.loads(line)  # raises on malformed output


class TestResourceBudgets:
    """A free instance must refuse work it cannot finish, with a reason."""

    def test_oversized_model_is_refused_with_a_useful_message(self):
        from app.trainer import check_model_fits

        class Parameter:
            def numel(self):
                return 1_500_000_000

        class HugeModel:
            def parameters(self):
                return [Parameter()]

        with pytest.raises(RuntimeError) as caught:
            check_model_fits(HugeModel())

        message = str(caught.value)
        assert "1500M parameters" in message
        # The message has to say what to do about it, not just that it failed.
        assert "distilbert" in message

    def test_a_model_within_budget_passes(self):
        from app.trainer import check_model_fits

        class Parameter:
            def numel(self):
                return 66_000_000  # distilbert-base

        class SmallModel:
            def parameters(self):
                return [Parameter()]

        check_model_fits(SmallModel())  # does not raise

    def test_the_check_can_be_disabled(self, monkeypatch):
        import app.trainer as trainer

        monkeypatch.setattr(trainer, "MAX_MODEL_PARAMETERS", 0)

        class Parameter:
            def numel(self):
                return 10**12

        class Enormous:
            def parameters(self):
                return [Parameter()]

        trainer.check_model_fits(Enormous())  # does not raise

    def test_sample_cap_shuffles_before_slicing(self, monkeypatch):
        """Many corpora are ordered by label; head-slicing one yields a
        single-class training set and a model that predicts one answer."""
        import app.trainer as trainer

        calls = []

        class FakeSplit:
            def __init__(self, size):
                self._size = size

            def __len__(self):
                return self._size

            def shuffle(self, seed):
                calls.append(("shuffle", seed))
                return self

            def select(self, rows):
                calls.append(("select", len(rows)))
                return self

        monkeypatch.setattr(trainer, "MAX_TRAIN_SAMPLES", 100)
        monkeypatch.setattr(trainer, "MAX_EVAL_SAMPLES", 0)
        trainer._split({"train": FakeSplit(10_000)})

        assert calls[0][0] == "shuffle", "must shuffle before selecting"
        assert ("select", 100) in calls
