# Security Policy

## Supported versions

Reflex Cube is developed on `main`. Fixes land there; there is no backport
branch.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Report it through GitHub's private vulnerability reporting on this repository
(Security → Report a vulnerability). Include what you found, how to reproduce
it, and what an attacker could do with it. You should get an acknowledgement
within a few days.

## What this project exposes

Some of this is unusual, so it is worth stating plainly before you deploy it.

- **Accounts guard everything that costs CPU.** Training and cube execution
  require a signed-in user, and jobs are scoped to their owner. The catalog and
  the health endpoint stay public. `REQUIRE_AUTH=0` disables this for a
  single-user local install — never for anything reachable from the internet.
- **`JWT_SECRET` must be set in a deployment.** The server refuses a secret
  under 32 bytes, and when none is given it generates one per process, which
  signs every user out on restart and breaks sessions across replicas.
- **There is no rate limiting.** A signed-in user is limited to one concurrent
  training job, and the instance to two, but nothing caps how fast accounts can
  be created or requests made. Put a rate limiter in front of a public
  deployment.
- **A Hugging Face token stored by a user is a write credential.** It is kept
  so their trained models can be pushed to their own account, is never returned
  by the API, and is only read by the training worker for that user's own jobs.
  It is stored as given, not encrypted at rest, so protect the database
  accordingly.
- **Training downloads and runs third-party artefacts.** Models and datasets
  come from the Hugging Face Hub. `HF_TRUST_REMOTE_CODE` is off by default
  because turning it on lets a dataset repository execute its own loading
  script in your process. Turn it on only for datasets you trust.
- **The agent loop executes model-written code.** `ReflexBrain` runs generated
  Python inside an E2B sandbox, never in the API process. Credentials are
  passed to the sandbox as environment variables rather than interpolated into
  the source, so they do not surface in a traceback or in the generated report.
  Without `E2B_API_KEY` the execution step is skipped entirely.
- **Cube consoles accept uploads.** Images sent to the Vision, Dream, Chef and
  Lens cubes are decoded and written under `CUBE_STORAGE_PATH`.
- **Job ids are validated as UUIDs** before being joined onto a storage path,
  so a crafted id cannot escape the storage root.
- **Login does not reveal which addresses have accounts.** An unknown address
  and a wrong password return an identical response, and the unknown-address
  path still performs a hash so it cannot be distinguished by timing.

## Credentials

Keep tokens in `backend/.env` (git-ignored) or in your deployment's secret
store — never in the repository. `backend/.env.example` lists every variable
the application reads. `python -m scripts.check_env` reports which credentials
are set without printing their values.

If you believe a credential has been committed, rotate it first and report it
second.
