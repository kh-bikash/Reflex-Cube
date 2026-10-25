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


def _normalise_database_url(url: str) -> str:
    """Make a hosted provider's connection string usable by SQLAlchemy 2.

    Neon, Supabase, Railway and Heroku all hand out `postgres://…`, a scheme
    SQLAlchemy dropped, and the bare `postgresql://` form selects psycopg2,
    which is not what we install. Both are rewritten to the psycopg 3 driver.
    """
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]

    # Managed Postgres requires TLS and rejects a plaintext connection.
    if url.startswith("postgresql+psycopg://") and "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"

    return url


DATABASE_URL = _normalise_database_url(
    os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'reflex.db'}")
)

#: True when the database survives a container restart. A SQLite file on a
#: hosted container's ephemeral disk does not.
DATABASE_IS_PERSISTENT = not DATABASE_URL.startswith("sqlite")

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

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


#: Collected at import and logged once at startup, so configuration problems
#: are visible without printing during module import.
_WARNINGS: list[str] = []

#: Minimum signing-secret length, matching the SHA-256 digest size.
_MIN_SECRET_BYTES = 32


def _secret_from_env(name: str) -> str:
    """Read a signing secret, generating an ephemeral one if unset.

    A generated secret is fine for local development; it changes on restart, so
    every token is invalidated. In a deployment it must be set, or users are
    logged out whenever the process restarts and tokens issued by one replica
    are rejected by another.
    """
    import secrets

    value = os.getenv(name)
    if value:
        # HS256 keys shorter than the 32-byte digest weaken the signature, and
        # PyJWT warns on every verification. Reject rather than warn forever.
        if len(value.encode("utf-8")) < _MIN_SECRET_BYTES:
            raise ValueError(
                f"{name} must be at least {_MIN_SECRET_BYTES} bytes "
                f"(got {len(value.encode('utf-8'))}). Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return value

    generated = secrets.token_urlsafe(48)
    _WARNINGS.append(
        f"{name} is not set; using a per-process secret. Sessions will not "
        "survive a restart and will not work across replicas."
    )
    return generated


JWT_SECRET = _secret_from_env("JWT_SECRET")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MINUTES = _int_from_env("ACCESS_TOKEN_TTL_MINUTES", 60 * 24 * 7)

#: Require a signed-in user for training and cube execution. Leave on for any
#: deployment reachable from the internet: both spend real CPU.
REQUIRE_AUTH = _bool_from_env("REQUIRE_AUTH", True)

#: Close registration once you have the users you want.
ALLOW_REGISTRATION = _bool_from_env("ALLOW_REGISTRATION", True)

MIN_PASSWORD_LENGTH = _int_from_env("MIN_PASSWORD_LENGTH", 8)

#: Concurrent training jobs per user, and across the whole instance. A free
#: container has two cores; without a limit one person can fill the queue.
MAX_CONCURRENT_JOBS_PER_USER = _int_from_env("MAX_CONCURRENT_JOBS_PER_USER", 1)
MAX_CONCURRENT_JOBS_TOTAL = _int_from_env("MAX_CONCURRENT_JOBS_TOTAL", 2)


def startup_warnings() -> list[str]:
    """Configuration problems worth logging once the logger exists."""
    return list(_WARNINGS)


# ---------------------------------------------------------------------------
# Model publishing
# ---------------------------------------------------------------------------

#: Push finished models to the Hugging Face Hub. Essential on a hosted
#: container, whose disk is wiped on every restart: without it a trained model
#: exists only until the instance recycles.
PUBLISH_MODELS_TO_HUB = _bool_from_env("PUBLISH_MODELS_TO_HUB", False)

#: Account the models land in when a user has not supplied their own token.
#: Empty means "the account that owns HF_TOKEN".
HUB_NAMESPACE = os.getenv("HUB_NAMESPACE", "")

#: Create pushed repos as private.
HUB_PRIVATE = _bool_from_env("HUB_PRIVATE", False)


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
