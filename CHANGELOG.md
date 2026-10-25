# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] — 2026-10-25

Makes the project deployable as a public service rather than a local checkout,
and rebuilds the interface.

### Added

- **Accounts.** Registration, sign-in, and per-user job ownership, with bcrypt
  password hashing and JWT sessions. Required by default; `REQUIRE_AUTH=0`
  keeps a single-user local install working. Concurrency limits stop one user
  filling a small instance's queue.
- **Hosted Postgres.** `DATABASE_URL` accepts the connection strings Neon,
  Supabase, Railway and Heroku hand out, with pooling tuned for serverless
  Postgres. A SQLite file on a hosted container does not survive a restart.
- **Model publishing.** Finished models are pushed to the Hugging Face Hub with
  a generated model card, so they outlive the container that trained them.
  Users can supply their own write token to publish under their own account.
- **A free hosting path.** Spaces-compatible image, Space card, a GitHub Action
  that deploys the backend, `vercel.json` for the frontend, and
  [docs/hosting.md](docs/hosting.md) covering the whole free stack.
- **Resource budgets.** A model too large for the instance is refused with an
  explanation instead of being OOM-killed, and a run that passes its wall-clock
  budget stops with its weights saved.
- **A design system.** Complete light and dark token sets, shared primitives,
  a geometric SVG logomark, and an SVG pipeline diagram. Sign-in, sign-up and
  settings pages; rewritten home, studio, models and cube pages.

### Fixed

- `tailwind.config.ts` referenced six CSS variables the stylesheet never
  defined, so `border-border` compiled to an empty `hsl()` and every bordered
  element fell back to the browser default; `font-sans` and `font-display`
  pointed at fonts that were never loaded.
- The eighteen cube consoles each hardcoded their own palette and ignored the
  theme; several were unreadable against a light background.
- The model download link rendered `undefined/api/...` whenever `VITE_API_URL`
  was empty — the same-origin default — and could not send an auth header.
- `GET /api/training/status` omitted the prompt, so the dashboard could not
  tell two runs apart.

### Removed

- Four AI-generated cube illustrations, a stock hero video, and twenty-odd
  landing-page components left over from an earlier layout.

## [2.0.0] — 2026-10-25

A correctness and packaging release. The previous tree could not be installed
or run outside its author's Windows machine, and the Cube architecture was
unreachable from the API. Behaviour that worked is preserved; what changed is
listed below.

### Fixed

- **The backend could not run on Linux or macOS.** `app/config.py` hardcoded
  `D:\ReflexCubeData\...` for the storage and Hugging Face roots and created
  them at import, ignoring the `STORAGE_PATH` the Dockerfile set.
- **Training could never start off Windows.** The worker was spawned with
  `creationflags=CREATE_NEW_CONSOLE`, which raises `ValueError` on POSIX.
- **The 16 Intelligence Cubes were unreachable.** `POST /api/cubes/run` sent
  every request to the agent loop and never consulted the registry, so each
  console received a markdown string where it expected its own payload.
- **`npm install` failed.** `@react-three/fiber@9` and `@react-three/drei@10`
  require React 19 against the project's React 18.
- **TypeScript checked nothing.** `tsconfig.app.json` pointed `include` and
  `paths` at `frontend/src` from inside `frontend/`, so no file matched.
- **Two UI modules could not resolve their imports** — `ui/dialog` and
  `ui/separator` were committed as `diaglog.tsx` and `seperator.tsx`.
- **The SSE log stream never terminated**, leaking a connection per page view.
- **`requirements.txt` omitted torch, transformers, Pillow, yfinance, easyocr,
  markdown, xhtml2pdf** and more, so the backend could not be installed.
- A trainer failure during setup raised `NameError` in its own handler and
  buried the real error.
- `brain.py` built a 2B-parameter model at import time and hardcoded
  `.to("cuda")`.
- `apify_tools.py` raised at import when `APIFY_API_TOKEN` was unset, taking
  down anything that imported it — including the cube registry.
- CORS sent `allow_origins=["*"]` together with `allow_credentials=True`, which
  browsers reject.
- The token-classification data collator was never attached (it keyed off a
  task name the pipeline never produces).
- Forge, Vision, Dream and Nexus wrote to relative `storage/...` paths, and
  Dream left `temp_fp32.pt` in the working directory.
- Dream's image generation ignored its prompt entirely; Travel discarded the
  user's selected "vibe"; Alpha computed a forward P/E and never returned it.
- Database sessions leaked on any exception between open and close.
- `app/utils.py` was shadowed by the `app/utils/` package and unreachable.

### Added

- `GET /api/health`, `GET /api/cubes`, `GET /api/cubes/{id}` and
  `POST /api/newsletter/subscribe` (the frontend already called the last one).
- A lazy, fault-tolerant cube registry that records import failures instead of
  swallowing them, and now includes the `dream` and `legacy` cubes.
- Evaluation during training: a held-out split, accuracy, and a persisted
  `metrics.json`. Sample counts are capped and shuffled before slicing.
- `scripts/check_env`, `scripts/reset_db` and `scripts/cancel_jobs`, replacing
  26 ad-hoc debug scripts.
- 216 backend tests, with outbound network blocked during the suite.
- GitHub Actions for both sides, including the backend suite on Linux, macOS
  and Windows, a Docker image build and a `npm audit` gate.
- A frontend Dockerfile with an nginx config that proxies `/api` unbuffered,
  and a `docker-compose.yml` that runs the whole stack.
- `LICENSE` (MIT, as the README has always claimed), `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.env.example` for both sides, a
  `Makefile` and `docs/`.

### Changed

- `api.py` is an application factory; endpoints live in `app/routes/`.
- Routes and cube consoles are lazy-loaded: the entry bundle fell from 1,214 kB
  to 120 kB, with vendor code split into react/three/charts/motion chunks.
- `frontend/src/lib/cubes.ts` is the single source of truth for the cube
  catalog; `CubePage` renders from it instead of an 18-arm switch.
- Requirements are split into core / ml / dev, so the API installs in seconds
  and CI needs no GPU stack.
- `@app.on_event` replaced with a lifespan context manager.
- Structured logging replaces the exception-swallowing `safe_print`.
- Dependency upgrades closing every reported advisory (`npm audit` is clean):
  Vite 7, React Router 7, Tailwind 3.4.19, and an override pinning
  `postcss-selector-parser` to the patched 7.1.x line.

### Removed

- 26 debug scripts and stray log files from the backend root, and the committed
  runtime artefacts under `storage/`.
- `ModelZoo.tsx` and `ForgePage.tsx` (byte-identical and both unrouted), and
  the unreferenced `NexusLLM.tsx`.
- Unused frontend dependencies: `zod`, `@hookform/resolvers`, `valtio`,
  `@studio-freight/lenis`, `sass`, `typeui.sh` and `lovable-tagger`.

### Security

- Job ids are validated as UUIDs before being joined onto a storage path.
- Agent sandbox credentials are passed as sandbox environment variables instead
  of being interpolated into generated source, where they could surface in a
  traceback or the final report.
- The user-supplied title in PDF export is HTML-escaped, and the output
  filename is sanitised.
- `datasets` no longer trusts remote loading code by default
  (`HF_TRUST_REMOTE_CODE=0`).
- The backend image runs as a non-root user with a healthcheck.

## [1.0.0]

Initial Reflex Cube release: prompt-to-model training pipeline, the Intelligence
Cube modules, and the React/Three.js dashboard.
