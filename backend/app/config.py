"""Central runtime configuration.

Every path and credential is read from the environment with a cross-platform
default, so the same image runs on a laptop, in Docker and in CI. Importing this
module has one deliberate side effect: it exports the Hugging Face cache
variables, because `transformers` and `datasets` read them at *their* import
time and would otherwise scatter multi-gigabyte downloads into `~/.cache`.
"""

from __future__ import annotations

import os
from pathlib import Path

try:  # python-dotenv is optional at runtime (e.g. in a slim container)
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - exercised only without the extra
    pass

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

#: Repository's `backend/` directory.
BASE_DIR = Path(__file__).resolve().parent.parent


def _path_from_env(name: str, default: Path) -> Path:
    """Read a directory path from the environment, falling back to `default`."""
    raw = os.getenv(name)
    return Path(raw).expanduser().resolve() if raw else default


#: Root for everything the app writes at runtime: checkpoints, job logs, uploads.
DATA_DIR = _path_from_env("REFLEX_DATA_DIR", BASE_DIR.parent / "storage")

#: Per-job model artefacts (`<STORAGE_PATH>/<job_id>/`).
STORAGE_PATH = str(_path_from_env("STORAGE_PATH", DATA_DIR / "models"))

#: Hugging Face cache root. Shared by hub downloads, datasets and transformers.
HF_HOME = _path_from_env("HF_HOME", DATA_DIR / "huggingface")

#: Scratch space for cube state that is not a trained model (Nexus memory, Forge
#: checkpoints, Vision/Dream datasets).
CUBE_STORAGE_PATH = str(_path_from_env("CUBE_STORAGE_PATH", DATA_DIR / "cubes"))

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'reflex.db'}")

# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def _csv_from_env(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


#: Origins allowed to call the API from a browser. The defaults cover the Vite
#: dev server; set CORS_ORIGINS in deployments. "*" is honoured but then
#: credentials are disabled, because the two are mutually exclusive per spec.
CORS_ORIGINS = _csv_from_env(
    "CORS_ORIGINS",
    "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173",
)

ALLOW_CREDENTIALS = "*" not in CORS_ORIGINS

# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------


def _int_from_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _float_from_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _bool_from_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


#: Cap on training rows. Hugging Face corpora run to millions of examples, and an
#: unbounded fine-tune on CPU never finishes; 0 disables the cap.
MAX_TRAIN_SAMPLES = _int_from_env("MAX_TRAIN_SAMPLES", 2000)

#: Rows held out to report eval metrics; 0 skips evaluation.
MAX_EVAL_SAMPLES = _int_from_env("MAX_EVAL_SAMPLES", 500)

TRAIN_EPOCHS = _float_from_env("TRAIN_EPOCHS", 1.0)
TRAIN_BATCH_SIZE = _int_from_env("TRAIN_BATCH_SIZE", 8)
TRAIN_LEARNING_RATE = _float_from_env("TRAIN_LEARNING_RATE", 2e-5)
TRAIN_MAX_LENGTH = _int_from_env("TRAIN_MAX_LENGTH", 128)

#: `datasets` executes repo-provided loading scripts when this is on. Off by
#: default: it is arbitrary code execution from the Hub.
TRUST_REMOTE_CODE = _bool_from_env("HF_TRUST_REMOTE_CODE", False)

# ---------------------------------------------------------------------------
# Models and credentials
# ---------------------------------------------------------------------------

#: Model backing the ReflexBrain agent loop.
BRAIN_MODEL_ID = os.getenv("BRAIN_MODEL_ID", "google/gemma-2b-it")

#: Sentence embedding model backing Nexus memory.
EMBEDDING_MODEL_ID = os.getenv("EMBEDDING_MODEL_ID", "all-MiniLM-L6-v2")

#: Load the brain lazily on first use instead of at startup. Startup loading
#: costs a multi-gigabyte download before the server answers its first request.
BRAIN_EAGER_LOAD = _bool_from_env("BRAIN_EAGER_LOAD", False)

HF_TOKEN = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")
E2B_API_KEY = os.getenv("E2B_API_KEY")
APIFY_API_TOKEN = os.getenv("APIFY_API_TOKEN")
SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY")

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


def ensure_directories() -> None:
    """Create the runtime directories and point the HF caches at them.

    Called at import so that `transformers`/`datasets`, which read these
    variables when *they* are imported, see them already set.
    """
    for path in (DATA_DIR, Path(STORAGE_PATH), Path(CUBE_STORAGE_PATH), HF_HOME):
        path.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("HF_HOME", str(HF_HOME))
    os.environ.setdefault("HF_DATASETS_CACHE", str(HF_HOME / "datasets"))
    # TRANSFORMERS_CACHE is deprecated in transformers>=4.36 in favour of HF_HOME,
    # but older pinned versions still honour it.
    os.environ.setdefault("TRANSFORMERS_CACHE", str(HF_HOME / "models"))
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")


ensure_directories()
