"""Report which optional dependencies and credentials this install has.

    python -m scripts.check_env

Exits non-zero if a *required* dependency is missing, so CI and container
healthchecks can use it as a gate. Optional extras are reported, not enforced.
"""

from __future__ import annotations

import importlib.metadata as metadata
import sys

from app import __version__
from app.config import (
    APIFY_API_TOKEN,
    CORS_ORIGINS,
    CUBE_STORAGE_PATH,
    DATABASE_URL,
    E2B_API_KEY,
    HF_HOME,
    HF_TOKEN,
    SERPAPI_API_KEY,
    STORAGE_PATH,
)
from app.cubes.registry import registry

REQUIRED = ["fastapi", "uvicorn", "sqlalchemy", "pydantic"]
OPTIONAL = [
    "torch",
    "torchvision",
    "transformers",
    "datasets",
    "sentence-transformers",
    "huggingface-hub",
    "yfinance",
    "easyocr",
    "pytesseract",
    "opencv-python-headless",
    "pillow",
    "pypdf",
    "markdown",
    "xhtml2pdf",
    "tiktoken",
    "apify-client",
    "e2b-code-interpreter",
    "turbovec",
]


def _version(package: str) -> str | None:
    try:
        return metadata.version(package)
    except metadata.PackageNotFoundError:
        return None


def main() -> int:
    print(f"Reflex Cube backend {__version__} on Python {sys.version.split()[0]}\n")

    print("Paths")
    print(f"  STORAGE_PATH       {STORAGE_PATH}")
    print(f"  CUBE_STORAGE_PATH  {CUBE_STORAGE_PATH}")
    print(f"  HF_HOME            {HF_HOME}")
    print(f"  DATABASE_URL       {DATABASE_URL}")
    print(f"  CORS_ORIGINS       {', '.join(CORS_ORIGINS)}\n")

    missing = []
    print("Required packages")
    for package in REQUIRED:
        version = _version(package)
        print(f"  {'OK  ' if version else 'MISS'} {package:<26} {version or '-'}")
        if not version:
            missing.append(package)

    print("\nOptional packages (features degrade without these)")
    for package in OPTIONAL:
        version = _version(package)
        print(f"  {'OK  ' if version else '--  '} {package:<26} {version or 'not installed'}")

    print("\nCredentials (values are never printed)")
    for label, value in (
        ("HF_TOKEN", HF_TOKEN),
        ("E2B_API_KEY", E2B_API_KEY),
        ("APIFY_API_TOKEN", APIFY_API_TOKEN),
        ("SERPAPI_API_KEY", SERPAPI_API_KEY),
    ):
        print(f"  {'set  ' if value else 'unset'} {label}")

    print("\nCubes")
    result = registry.preload()
    print(f"  loaded  {len(result['loaded'])}: {', '.join(result['loaded']) or '-'}")
    if result["failed"]:
        print(f"  failed  {len(result['failed'])}:")
        for cube_id, error in result["failed"].items():
            print(f"            {cube_id}: {error}")

    if missing:
        print(f"\nFAIL: missing required packages: {', '.join(missing)}")
        return 1
    print("\nOK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
