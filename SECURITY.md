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

- **The API has no authentication.** Every endpoint is open to anyone who can
  reach the port. Run it behind your own auth layer, or on a private network.
  Treat the defaults as a development configuration.
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

## Credentials

Keep tokens in `backend/.env` (git-ignored) or in your deployment's secret
store — never in the repository. `backend/.env.example` lists every variable
the application reads. `python -m scripts.check_env` reports which credentials
are set without printing their values.

If you believe a credential has been committed, rotate it first and report it
second.
