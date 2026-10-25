"""Discovery and lazy instantiation of the Intelligence Cubes.

Cubes pull in heavy, optional dependencies — torch, easyocr, yfinance, OpenCV —
and several load model weights in `__init__`. Instantiating all of them at
import time (what this module used to do) meant one missing wheel silently
dropped a cube from the catalog and a cold start paid for every model at once.

So the registry keeps a *declaration* of each cube and only imports and builds
one the first time it is asked for. Import failures are recorded and surfaced
through `errors()` and the health endpoint instead of being swallowed.
"""

from __future__ import annotations

import importlib
import threading
from dataclasses import dataclass
from typing import Any

from ..logging_config import get_logger
from .base import Cube

logger = get_logger(__name__)


@dataclass(frozen=True)
class CubeSpec:
    """Where to find a cube, and what to call it before it is loaded."""

    cube_id: str
    module: str
    class_name: str
    name: str
    description: str


#: Declaration order is the order cubes appear in `GET /api/cubes`.
CUBE_SPECS: tuple[CubeSpec, ...] = (
    CubeSpec(
        "forge",
        "forge",
        "ForgeCube",
        "Forge Cube",
        "LLM training sandbox: design, train and sample a NanoGPT from scratch.",
    ),
    CubeSpec(
        "vision",
        "vision",
        "VisionCube",
        "Vision Cube",
        "Neural network lab: label images, augment, train a classifier and inspect it.",
    ),
    CubeSpec(
        "dream",
        "dream",
        "DreamCube",
        "Dream Cube",
        "Generative art pipeline: train a model and sample images from prompts.",
    ),
    CubeSpec(
        "chef",
        "chef",
        "ChefCube",
        "Chef Cube",
        "Culinary AI: read ingredients from a photo and return a safety check and recipe.",
    ),
    CubeSpec(
        "alpha",
        "alpha",
        "AlphaCube",
        "Alpha Cube",
        "Financial analysis: live market metrics, valuation rating and investment thesis.",
    ),
    CubeSpec(
        "nexus",
        "nexus",
        "NexusCube",
        "Nexus Cube",
        "Persistent semantic memory you can write to and recall from.",
    ),
    CubeSpec("lens", "lens", "LensCube", "Lens Cube", "OCR and summarisation of uploaded images."),
    CubeSpec(
        "sentinel",
        "sentinel",
        "SentinelCube",
        "Sentinel Cube",
        "Cybersecurity: detect SQLi/XSS/flooding and manage WAF rules.",
    ),
    CubeSpec(
        "legal",
        "legal",
        "LegalCube",
        "Legal Cube",
        "Contract compliance scoring and liability extraction.",
    ),
    CubeSpec(
        "ledger",
        "ledger",
        "LedgerCube",
        "Ledger Cube",
        "Forensic audit: reconcile invoices against a bank feed.",
    ),
    CubeSpec(
        "talent",
        "talent",
        "TalentCube",
        "Talent Cube",
        "Recruitment: derive scoring criteria from a job description and screen CVs.",
    ),
    CubeSpec(
        "career",
        "career",
        "CareerCube",
        "Career Cube",
        "Career pathing and ATS-oriented resume rewriting.",
    ),
    CubeSpec(
        "brand",
        "brand",
        "BrandCube",
        "Brand Cube",
        "Marketing copy, naming and brand identity guidelines.",
    ),
    CubeSpec(
        "fitpal",
        "fitpal",
        "FitPalCube",
        "FitPal Cube",
        "Biometrics-aware workout programming and fitness tracking.",
    ),
    CubeSpec(
        "travel",
        "travel",
        "TravelCube",
        "Travel Cube",
        "Itinerary planning with budget, weather and day-by-day routing.",
    ),
    CubeSpec(
        "legacy",
        "legacy",
        "LegacyCube",
        "Legacy Cube",
        "Long-form personal and family history capture and recall.",
    ),
)


class CubeRegistry:
    """Thread-safe lazy registry of `Cube` instances."""

    def __init__(self, specs: tuple[CubeSpec, ...] = CUBE_SPECS) -> None:
        self._specs: dict[str, CubeSpec] = {spec.cube_id: spec for spec in specs}
        self._instances: dict[str, Cube] = {}
        self._errors: dict[str, str] = {}
        self._lock = threading.Lock()

    # -- Registration ------------------------------------------------------

    def register(self, cube_id: str, cube_instance: Cube) -> None:
        """Register an already-built cube, replacing any declaration."""
        with self._lock:
            self._instances[cube_id] = cube_instance
            self._errors.pop(cube_id, None)

    # -- Lookup ------------------------------------------------------------

    def has(self, cube_id: str) -> bool:
        """True if `cube_id` is declared, whether or not it has loaded yet."""
        return cube_id in self._specs or cube_id in self._instances

    def get_cube(self, cube_id: str) -> Cube | None:
        """Return the cube instance, importing it on first use.

        Returns `None` if the id is unknown or the cube failed to import; the
        reason for a failure is available from `errors()`.
        """
        instance = self._instances.get(cube_id)
        if instance is not None:
            return instance

        spec = self._specs.get(cube_id)
        if spec is None:
            return None

        with self._lock:
            # Another thread may have loaded it while we waited.
            if cube_id in self._instances:
                return self._instances[cube_id]
            if cube_id in self._errors:
                return None
            try:
                module = importlib.import_module(f".{spec.module}", package=__package__)
                cube_class = getattr(module, spec.class_name)
                instance = cube_class()
            except Exception as exc:
                self._errors[cube_id] = f"{type(exc).__name__}: {exc}"
                logger.warning("Cube %r unavailable: %s", cube_id, exc)
                return None
            self._instances[cube_id] = instance
            logger.info("Loaded cube %r", cube_id)
            return instance

    # -- Introspection -----------------------------------------------------

    def list_cubes(self) -> list[dict[str, str]]:
        """Catalog entries for every declared cube, without importing any."""
        listing = [
            {"id": spec.cube_id, "name": spec.name, "description": spec.description}
            for spec in self._specs.values()
        ]
        # Cubes registered at runtime (e.g. in tests) are not declared.
        for cube_id, instance in self._instances.items():
            if cube_id not in self._specs:
                listing.append(
                    {
                        "id": cube_id,
                        "name": instance.name,
                        "description": instance.description,
                    }
                )
        return listing

    def errors(self) -> dict[str, str]:
        """Import failures recorded so far, keyed by cube id."""
        return dict(self._errors)

    def preload(self) -> dict[str, Any]:
        """Import every cube eagerly and report what succeeded.

        Only used by the health check and the verification script; the server
        does not call it, so a broken optional dependency never blocks startup.
        """
        loaded = [cube_id for cube_id in self._specs if self.get_cube(cube_id) is not None]
        return {"loaded": loaded, "failed": self.errors()}

    def __len__(self) -> int:
        return len(self._specs) + len(set(self._instances) - set(self._specs))


#: Process-wide registry used by the API.
registry = CubeRegistry()
