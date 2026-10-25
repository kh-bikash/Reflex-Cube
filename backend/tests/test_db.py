"""Session handling and the additive SQLite migration."""

from __future__ import annotations

import pytest
from sqlalchemy import inspect, text

from app.db import Base, engine, init_db, session_scope
from app.models import JobStatusValue, TrainingJob


def test_init_db_is_idempotent():
    init_db()
    init_db()
    assert "training_jobs" in inspect(engine).get_table_names()


def test_session_scope_commits(db_session):
    with session_scope() as session:
        session.add(TrainingJob(id="11111111-1111-1111-1111-111111111111", name="a", prompt="p"))

    with session_scope() as session:
        assert session.get(TrainingJob, "11111111-1111-1111-1111-111111111111") is not None


def test_session_scope_rolls_back_on_error(db_session):
    with pytest.raises(RuntimeError), session_scope() as session:
        session.add(TrainingJob(id="22222222-2222-2222-2222-222222222222", name="b", prompt="p"))
        raise RuntimeError("boom")

    with session_scope() as session:
        assert session.get(TrainingJob, "22222222-2222-2222-2222-222222222222") is None


def test_missing_columns_are_added_to_an_existing_table():
    """A database written by an earlier version must keep working.

    `create_all` only creates whole tables, so without this every query against
    a newly added column fails with "no such column".
    """
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE training_jobs (id VARCHAR PRIMARY KEY, name VARCHAR)")
        )

    init_db()

    columns = {column["name"] for column in inspect(engine).get_columns("training_jobs")}
    assert {"model_name", "dataset_name", "created_at", "accuracy"} <= columns

    with session_scope() as session:
        session.add(
            TrainingJob(
                id="33333333-3333-3333-3333-333333333333",
                name="c",
                prompt="p",
                model_name="distilbert-base-uncased",
            )
        )
    with session_scope() as session:
        job = session.get(TrainingJob, "33333333-3333-3333-3333-333333333333")
        assert job.model_name == "distilbert-base-uncased"

    Base.metadata.drop_all(bind=engine)


def test_active_and_terminal_states_are_disjoint():
    assert not set(JobStatusValue.ACTIVE) & set(JobStatusValue.TERMINAL)


def test_orphaned_jobs_are_reaped_on_startup(client, db_session):
    """Training runs in a detached subprocess that dies with the server."""
    from app.api import _reap_orphaned_jobs

    db_session.add(
        TrainingJob(
            id="44444444-4444-4444-4444-444444444444",
            name="stuck",
            prompt="p",
            status=JobStatusValue.TRAINING,
        )
    )
    db_session.commit()

    assert _reap_orphaned_jobs() == 1

    db_session.expire_all()
    job = db_session.get(TrainingJob, "44444444-4444-4444-4444-444444444444")
    assert job.status == JobStatusValue.FAILED
    assert "restart" in job.error
