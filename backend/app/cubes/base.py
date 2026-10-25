"""Base contract every Intelligence Cube implements."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class Cube(ABC):
    """A self-contained capability reachable through `POST /api/cubes/run`.

    Implementations receive the request's `input` field and return a JSON-
    serialisable dict that is sent to the client verbatim. By convention the
    dict carries a `status` of `"success"` or `"error"`; on error it also
    carries a human-readable `message`.

    `run()` should not raise for expected failures (a missing field, an
    unreachable upstream): return an error dict instead, so the client gets a
    usable message rather than a 500. Unexpected exceptions are caught by the
    API layer and reported as an error payload.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable cube name, e.g. `"Alpha Cube"`."""

    @property
    @abstractmethod
    def description(self) -> str:
        """One-line summary shown in the cube listing."""

    @abstractmethod
    def run(self, input_data: Any) -> dict[str, Any]:
        """Execute the cube's main logic.

        Args:
            input_data: Request payload. Usually a dict; cubes that accept free
                text also handle a plain string.

        Returns:
            A JSON-serialisable dict.
        """

    # -- Helpers available to every cube -----------------------------------

    @staticmethod
    def ok(**payload: Any) -> dict[str, Any]:
        """Build a success response."""
        return {"status": "success", **payload}

    @staticmethod
    def fail(message: str, **payload: Any) -> dict[str, Any]:
        """Build an error response."""
        return {"status": "error", "message": message, **payload}

    @staticmethod
    def as_dict(input_data: Any) -> dict[str, Any]:
        """Coerce the request payload to a dict.

        Several consoles post a bare string; normalising here means each cube
        can read `input_data.get(...)` without first checking the type.
        """
        if isinstance(input_data, dict):
            return input_data
        if input_data is None:
            return {}
        return {"text": str(input_data)}
