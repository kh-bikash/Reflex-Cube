# Contributing to Reflex Cube

Thanks for taking an interest. This guide covers getting set up, the checks
your change needs to pass, and the project's conventions.

## Getting set up

```bash
git clone https://github.com/kh-bikash/Reflex-Cube.git
cd Reflex-Cube
make setup          # backend venv (API-only) + frontend node_modules
make dev            # API on :8000, web client on :8080
```

`make setup` installs the **core** backend requirements, which is enough for
the API, the cube catalog, job tracking, log streaming and nine of the sixteen
cubes. Training and the model-backed cubes need the ML stack:

```bash
make setup-backend-ml   # adds torch, transformers, datasets, …  (several GB)
```

`make env` prints which optional packages and credentials are present and which
cubes can load as a result. Use it first when something reports itself
unavailable.

## Before you open a pull request

```bash
make check      # lint (ruff + ESLint), typecheck (tsc), tests (pytest)
```

CI runs the same commands plus `npm audit --audit-level=high`, a Docker image
build, and the backend suite on Linux, macOS and Windows. The cross-platform
matrix exists because this project has shipped Windows-only paths and
Windows-only subprocess flags before — please keep it green.

Autofix what can be autofixed:

```bash
make format     # ruff --fix, ruff format, eslint --fix
```

## Conventions

### Backend (Python)

- Formatting and linting are `ruff`'s; the config is in `backend/pyproject.toml`.
  Line length is 100.
- **Nothing heavy at import time.** `torch`, `transformers`, `datasets` and the
  per-cube extras are imported inside the function that uses them, so the API
  and the test suite run without a multi-gigabyte install.
- **No hardcoded paths.** Everything writable goes through `app.config`
  (`STORAGE_PATH`, `CUBE_STORAGE_PATH`, `HF_HOME`) or the helpers in
  `app.utils` (`job_dir`, `cube_dir`). A relative path resolves against
  whatever directory the server was started in.
- **Log, don't print.** Use `app.logging_config.get_logger(__name__)`.
- Database access goes through `session_scope()` (scripts, workers) or the
  `get_db` dependency (endpoints) so sessions are always closed.
- New endpoints get a Pydantic request and response model in `app/schemas.py`.

### Adding a cube

1. Write `backend/app/cubes/<name>.py` with a class that subclasses
   `Cube` and implements `name`, `description` and `run(input_data)`.
   `run()` returns a JSON-serialisable dict and **does not raise** for expected
   failures — return `self.fail("…")` instead, so the console shows a message
   rather than a 500. `self.as_dict(input_data)` normalises a payload that may
   arrive as a bare string.
2. Add a `CubeSpec` to `CUBE_SPECS` in `backend/app/cubes/registry.py`. The
   registry imports your module lazily, so an optional dependency that is not
   installed marks only your cube unavailable.
3. Add a matching entry to `frontend/src/lib/cubes.ts` with the **same id** and
   a lazy import of your console component. The `/cube/:id` route and the hub
   listings pick it up from there.
4. `backend/tests/test_cubes.py` will automatically assert your cube satisfies
   the contract, and `test_registry_ids_match_the_frontend_catalog` will fail
   if the two catalogs drift.

### Frontend (TypeScript / React)

- `npm run lint` and `npm run typecheck` must both pass; `tsc -b` runs as part
  of `npm run build`.
- Backend calls go through `src/lib/api.ts` rather than bare `fetch`.
- Route targets and cube consoles are lazy-loaded. Keep them that way: the
  entry bundle is ~120 kB and should stay there.
- Prefer the semantic Tailwind tokens (`bg-background`, `text-muted-foreground`)
  over raw colours, so both themes keep working.

## Tests

- `backend/tests/` is `pytest`. Fixtures live in `conftest.py`.
- **Tests must not reach the network.** An autouse fixture blocks outbound
  connections; if a test genuinely needs one, mark it `@pytest.mark.network`
  and expect it to be skipped in normal runs.
- Tests that need the ML stack should `pytest.skip` when it is absent, the way
  `test_cubes.py` does, so the suite is meaningful in a slim CI image.
- Please add a regression test with any bug fix.

## Commit messages

Conventional-commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`,
`test:`, `chore:`) with a scope where it helps: `fix(backend): …`. Explain what
was broken and why the change fixes it, not just what you touched.

## Reporting bugs

Open an issue with the output of `make env`, what you expected, what happened,
and the smallest reproduction you can manage. For a failing cube, include the
`status`/`message` payload the console showed.
