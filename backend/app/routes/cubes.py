"""Cube endpoints: catalog listing and dispatch."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from ..cubes.registry import registry
from ..logging_config import get_logger
from ..schemas import CubeInfo, CubeListResponse, CubeRunRequest

logger = get_logger(__name__)

router = APIRouter(prefix="/api/cubes", tags=["Cubes"])


@router.get("", response_model=CubeListResponse)
@router.get("/", response_model=CubeListResponse, include_in_schema=False)
def list_cubes() -> CubeListResponse:
    """List every declared cube. Does not import or load any of them."""
    cubes = [CubeInfo(**entry) for entry in registry.list_cubes()]
    return CubeListResponse(cubes=cubes, count=len(cubes))


@router.post("/run")
async def run_cube(request: CubeRunRequest) -> dict[str, Any]:
    """Execute a cube and return its payload verbatim.

    Dispatch order:

    1. A cube registered in `CubeRegistry` handles the request. Its dict is the
       response body, so consoles can read their own fields directly.
    2. Otherwise the request falls through to the ReflexBrain agent loop, which
       serves the free-text cubes (`research`, `social`) that have no Python
       implementation, and returns `{"status", "result"}` with markdown.

    Cube failures come back as `{"status": "error", "message": ...}` with HTTP
    200, because every console renders that shape; only a malformed request is
    a 4xx.
    """
    cube_id = request.cube_id.strip().lower()
    payload = request.input

    cube = registry.get_cube(cube_id)
    if cube is not None:
        try:
            result = await run_in_threadpool(cube.run, payload)
        except Exception as exc:
            logger.exception("Cube %r raised", cube_id)
            return {"status": "error", "message": f"{type(exc).__name__}: {exc}"}

        if not isinstance(result, dict):
            return {"status": "success", "result": result}
        result.setdefault("status", "success")
        return result

    # Declared but failed to import: say so instead of silently falling back to
    # a model that would hallucinate the cube's job.
    load_error = registry.errors().get(cube_id)
    if load_error:
        raise HTTPException(
            status_code=503,
            detail=f"Cube '{cube_id}' is installed but failed to load: {load_error}",
        )

    return await _run_agent_cube(cube_id, payload)


async def _run_agent_cube(cube_id: str, payload: Any) -> dict[str, Any]:
    """Serve a cube that has no Python implementation via the agent loop."""
    from ..brain import BrainUnavailable, get_brain

    brain = get_brain()
    try:
        result_text = await run_in_threadpool(brain.run_agent, payload, cube_id)
    except BrainUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                f"No cube is registered as '{cube_id}', and the agent fallback is "
                f"unavailable: {exc}"
            ),
        ) from exc
    except Exception as exc:
        logger.exception("Agent run failed for %r", cube_id)
        return {"status": "error", "message": f"{type(exc).__name__}: {exc}"}

    return {"status": "success", "result": result_text}


@router.get("/{cube_id}", response_model=CubeInfo)
def get_cube_info(cube_id: str) -> CubeInfo:
    """Metadata for a single cube."""
    for entry in registry.list_cubes():
        if entry["id"] == cube_id:
            return CubeInfo(**entry)
    raise HTTPException(status_code=404, detail=f"No cube registered as '{cube_id}'")
