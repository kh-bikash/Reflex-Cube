"""FastAPI application factory and lifespan wiring."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import ALLOW_CREDENTIALS, BRAIN_EAGER_LOAD, CORS_ORIGINS
from .db import init_db, session_scope
from .logging_config import configure_logging, get_logger
from .models import JobStatusValue, TrainingJob
from .routes import cubes, logs, models, system

logger = get_logger(__name__)

DESCRIPTION = """
Reflex Cube turns a natural-language prompt into a trained model, and exposes a
registry of task-specific **Intelligence Cubes** behind one dispatch endpoint.

* `POST /api/models/create` queues a prompt; training runs in a subprocess.
* `GET /api/logs/{job_id}` streams that job's progress as server-sent events.
* `POST /api/cubes/run` dispatches to a registered cube, or to the agent loop.
"""


def _reap_orphaned_jobs() -> int:
    """Fail jobs left mid-flight by a previous process.

    Training runs in a detached subprocess that does not survive a server
    restart, so anything still in an active state is unrecoverable.
    """
    with session_scope() as session:
        stale = (
            session.query(TrainingJob).filter(TrainingJob.status.in_(JobStatusValue.ACTIVE)).all()
        )
        for job in stale:
            logger.info("Marking orphaned job %s as failed.", job.id)
            job.status = JobStatusValue.FAILED
            job.error = "Job interrupted by a server restart."
        return len(stale)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup/shutdown hooks (replaces the deprecated `@app.on_event`)."""
    configure_logging()
    init_db()

    reaped = _reap_orphaned_jobs()
    if reaped:
        logger.info("Reaped %d orphaned training job(s).", reaped)

    if BRAIN_EAGER_LOAD:
        # Off by default: loading the agent model costs a multi-gigabyte
        # download before the server can answer its first request.
        from .brain import get_brain

        logger.info("BRAIN_EAGER_LOAD is set; warming up ReflexBrain…")
        get_brain().ensure_loaded()

    logger.info("Reflex Cube API %s ready.", __version__)
    yield
    logger.info("Reflex Cube API shutting down.")


def create_app() -> FastAPI:
    """Build the application. Kept factory-shaped so tests get a fresh app."""
    application = FastAPI(
        title="Reflex Cube API",
        description=DESCRIPTION,
        version=__version__,
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        # Browsers reject `Access-Control-Allow-Origin: *` together with
        # credentials, so this is derived from the origin list rather than
        # hard-coded to True as it used to be.
        allow_credentials=ALLOW_CREDENTIALS,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    application.include_router(system.router)
    application.include_router(models.router)
    application.include_router(cubes.router)
    application.include_router(logs.router)

    return application


app = create_app()
