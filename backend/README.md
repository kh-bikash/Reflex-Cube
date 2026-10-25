# Reflex Cube — Backend

FastAPI service for prompt-to-model training and the Intelligence Cube
registry. See the [root README](../README.md) for the whole project and
[docs/architecture.md](../docs/architecture.md) for how the pieces fit.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt    # core API — starts in seconds
cp .env.example .env               # optional; defaults work

uvicorn app.api:app --reload --port 8000
```

Interactive docs at <http://localhost:8000/docs>.

### Installing the training stack

The core install runs the API, the cube catalog, job tracking, log streaming
and nine of the sixteen cubes. Training and the model-backed cubes need:

```bash
# CPU-only machines: install torch from the CPU index to avoid ~2 GB of CUDA
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-ml.txt
```

`python -m scripts.check_env` reports what is installed, which credentials are
set (never their values), and the exact import error for each unavailable cube.

## Layout

```text
app/
├── api.py            # Application factory, CORS, lifespan
├── config.py         # Env-driven settings — the only source of paths
├── db.py             # Engine, session_scope(), get_db(), additive migration
├── models.py         # SQLAlchemy models and the job status vocabulary
├── schemas.py        # Pydantic request/response models
├── logging_config.py # Shared logging setup
├── interpreter.py    # Prompt → base model + dataset
├── trainer.py        # The training pipeline
├── brain.py          # ReflexBrain agent loop (lazy)
├── apify_tools.py    # Scraping actors (lazy client)
├── routes/           # models · cubes · logs · system
├── cubes/            # 16 cube implementations + the lazy registry
└── utils/            # Path helpers, AI provider router
scripts/              # check_env · reset_db · cancel_jobs
tests/                # pytest suite
train_worker.py       # Detached per-job training process
```

## Development

```bash
pip install -r requirements-dev.txt

pytest                      # 216 tests
pytest --cov=app            # with coverage
ruff check .                # lint
ruff format .               # format
```

Tests run without the ML stack: cubes and paths that need torch skip
themselves. Outbound network is blocked during the suite — mark a test
`@pytest.mark.network` if it genuinely needs it.

## Conventions

- **Nothing heavy at import time.** `torch`, `transformers`, `datasets` and the
  per-cube extras are imported inside the function that uses them.
- **No relative paths.** Writable locations come from `app.config`
  (`STORAGE_PATH`, `CUBE_STORAGE_PATH`, `HF_HOME`) or `app.utils`
  (`job_dir`, `cube_dir`).
- **Log, don't print**: `app.logging_config.get_logger(__name__)`.
- Database access goes through `session_scope()` or the `get_db` dependency.

Adding a cube: see
[CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-cube).

## Operational scripts

```bash
python -m scripts.check_env                # environment report
python -m scripts.cancel_jobs --dry-run    # list in-flight jobs
python -m scripts.cancel_jobs              # mark them cancelled
python -m scripts.reset_db --yes           # drop and recreate the schema
```

## Configuration

Every setting is an environment variable with a working default; the full list
with comments is in [`.env.example`](.env.example).
