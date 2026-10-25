"""SQLAlchemy engine, session factory and session helpers."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from .config import DATABASE_URL

_is_sqlite = DATABASE_URL.startswith("sqlite")

# `check_same_thread` only applies to SQLite, where the single connection is
# shared across the threadpool FastAPI runs sync endpoints on.
_connect_args: dict = {"check_same_thread": False} if _is_sqlite else {}

_engine_args: dict = {}
if not _is_sqlite:
    # Serverless Postgres (Neon, Supabase) drops idle connections, and a free
    # tier caps how many may be open at once. Pre-ping replaces a connection
    # the server already closed instead of failing the request; recycling and
    # a small pool keep us inside the cap.
    _engine_args = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
        "pool_size": 5,
        "max_overflow": 5,
    }

engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True, **_engine_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def init_db() -> None:
    """Create any missing tables and columns. Idempotent."""
    from . import models  # noqa: F401  (import registers the mappers)

    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


def _add_missing_columns() -> None:
    """Add columns present on the models but missing from an existing SQLite file.

    `create_all` only creates whole tables, so a database written by an earlier
    version keeps its old shape and every query against a new column fails. The
    project has no migration tool; this covers the additive case, which is all
    the schema has needed so far. A destructive change still needs
    `python -m scripts.reset_db`.
    """
    if not _is_sqlite:
        return

    from sqlalchemy import inspect, text
    from sqlalchemy.schema import CreateColumn

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                ddl = CreateColumn(column).compile(engine).string
                # SQLite cannot add a NOT NULL column without a constant default.
                if column.nullable is False and column.server_default is None:
                    ddl = ddl.replace(" NOT NULL", "")
                connection.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {ddl}'))


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope around a series of operations.

    Commits on success, rolls back on error, and always closes — the previous
    code leaked a connection on every exception between `SessionLocal()` and
    `db.close()`.
    """
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
