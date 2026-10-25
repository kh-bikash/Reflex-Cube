# Architecture

## The shape of the system

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React 18 SPA (Vite)                                            │
│    /generate   prompt studio                                    │
│    /dashboard  job list, live training chart, inference         │
│    /cube/:id   one console per Intelligence Cube (lazy-loaded)  │
└────────────┬──────────────────────────────┬─────────────────────┘
             │ fetch /api/*                 │ EventSource /api/logs/:id
             ▼                              ▼
┌──────────────────────── FastAPI (app.api) ──────────────────────┐
│  routes/models.py   create · status · predict · download        │
│  routes/cubes.py    catalog · dispatch                          │
│  routes/logs.py     server-sent events                          │
│  routes/system.py   health · newsletter · PDF export            │
└──┬──────────────────────┬───────────────────────┬───────────────┘
   │ spawn                │ dispatch              │ fall through
   ▼                      ▼                       ▼
train_worker.py      CubeRegistry            ReflexBrain
(detached process)   (lazy imports)          (lazy, E2B sandbox)
   │                      │                       │
   ▼                      ▼                       ▼
trainer.py           16 cubes               agent loop →
   │                                        generated Python
   ▼                                        in an E2B sandbox
SQLite + STORAGE_PATH/<job_id>/
  training_log.jsonl · metrics.json · model + tokenizer
```

## Design decisions worth knowing

### Training runs out of process

A fine-tune is CPU-bound for minutes to hours. Running it in the API process
— even on a thread — holds the GIL and starves request handling, so
`POST /api/models/create` spawns `train_worker.py` as a detached subprocess
(`start_new_session` on POSIX, `CREATE_NEW_PROCESS_GROUP` on Windows) and
returns `202` immediately.

The job payload goes in on **stdin**, not argv: it contains a user-supplied
prompt, and argv is length-limited (~32 KB on Windows) and readable by every
other process on the machine.

Because the worker is detached, it does not survive a server restart. The
lifespan hook reaps any job still in an active state on startup and marks it
failed, so nothing sits in `queued` forever.

### Progress travels through a file

The worker and the API are separate processes with no shared memory, so
progress moves through two channels:

- `STORAGE_PATH/<job_id>/training_log.jsonl` — one JSON object per event,
  flushed and `fsync`ed on write because a reader in another process would
  otherwise see nothing until close. `GET /api/logs/{job_id}` tails it as SSE.
- The `training_jobs` row — status, progress, epoch, loss, accuracy. This is
  what `GET /api/training/status/{job_id}` polls.

The SSE stream closes once the job reaches a terminal state and the file has
been drained. It heartbeats with an SSE comment every 15 idle seconds so
proxies do not drop a connection during a long quiet epoch, and sets
`X-Accel-Buffering: no` so nginx does not buffer the whole stream.

### Nothing heavy is imported at module scope

`torch`, `transformers`, `datasets` and the per-cube extras are imported inside
the functions that use them. This is deliberate, not incidental:

- The API image installs in seconds and the server starts without a GPU stack.
- CI runs the full test suite without downloading gigabytes.
- A missing optional dependency degrades one feature instead of crashing
  startup.

`app/trainer.py` imports cleanly on a machine with no ML stack at all; only
`_train()` needs torch. There is a test asserting this.

### The cube registry is lazy and fault-tolerant

`CUBE_SPECS` *declares* each cube — id, module, class, name, description. The
registry imports a module only when that cube is first requested, caches the
instance, and records any `ImportError` or constructor failure in `errors()`.

Consequences:

- `GET /api/cubes` answers from the declarations and imports nothing, so the
  catalog works on a slim install.
- `GET /api/health` and `scripts/check_env` report exactly which cubes are
  unavailable and why.
- A broken cube returns `503` with the import error, rather than silently
  falling through to the agent and getting a hallucinated answer.

### Two kinds of cube

`POST /api/cubes/run` dispatches in this order:

1. **Registry cube** — a `Cube` subclass handles a structured `input` object
   and returns a dict. That dict becomes the response body *verbatim*, which is
   what each console reads (`result.recipe`, `result.data`, `result.reply`).
2. **Agent cube** — an id with no Python module (`research`, `social`) goes to
   `ReflexBrain.run_agent`, which returns `{"status", "result"}` with markdown.

Cube failures come back as `{"status": "error", "message": ...}` with HTTP 200,
because every console renders that shape. Only a malformed request is a 4xx.

### The agent loop

`ReflexBrain` loads a quantized causal LM on first use — never at import, and
never at startup unless `BRAIN_EAGER_LOAD=1`. It reasons about the request, and
if it emits a ```python block, that code runs in an **E2B sandbox**, never in
the API process. Credentials reach the sandbox as environment variables rather
than being interpolated into the source, so a key cannot surface in a traceback
or in the report the model then writes.

Without `E2B_API_KEY` the execution step is skipped and the model's direct
answer is returned.

### All writable paths come from config

`app.config` resolves `STORAGE_PATH`, `CUBE_STORAGE_PATH` and `HF_HOME` from
the environment with cross-platform defaults, and `app.utils` provides
`job_dir()` and `cube_dir()` on top. Nothing builds a relative path, because a
relative path resolves against whatever directory the server happened to be
started in.

`job_dir()` validates the job id as a UUID first, so a crafted id cannot escape
the storage root.

Importing `app.config` exports `HF_HOME` and friends into `os.environ` as a
side effect, because `transformers` and `datasets` read those when *they* are
imported. Without it, multi-gigabyte downloads scatter into `~/.cache`.

## Request walkthrough: prompt to trained model

1. `POST /api/models/create` validates the request, inserts a `queued` row and
   spawns the worker. Returns `202 {job_id}`.
2. The browser opens `EventSource('/api/logs/<job_id>')`. The stream waits up
   to 60 s for the log file to appear.
3. The worker calls `run_training_job`, which:
   - resolves the task (`detect_task`),
   - resolves a base model and dataset (`PromptInterpreter`),
   - downloads the dataset, falling back **once** to a curated corpus,
   - caps and shuffles the rows, holds out an eval split,
   - tokenizes, builds the right model head, and fine-tunes,
   - evaluates, saves the model, tokenizer and `metrics.json`.
4. Each `Trainer` log line becomes a JSONL event and a row update. Progress
   runs 0–50 for setup, 50–95 during training, 95–100 while saving.
5. On completion the row goes to `completed` with `result_path`; the stream
   emits `event: end` and closes.
6. `POST /api/models/{job_id}/predict` loads the saved pipeline for the job's
   persisted task. `GET /api/models/download/{job_id}` zips the directory,
   reusing an existing archive when it is newer than every file in it.

Any failure marks the job `failed`, appends the reason to the row, writes the
traceback to `error.txt` next to the checkpoint, and emits a `failed` event so
the stream can close.

## Frontend

- **Routing** — `AnimatedRoutes` lazy-loads every route but the landing page.
- **Cube catalog** — `src/lib/cubes.ts` holds ids, metadata and a lazy import
  per console. `CubePage` renders from it; adding a cube needs no routing
  change. A backend test fails if the two catalogs drift.
- **API access** — all calls go through `src/lib/api.ts`. `VITE_API_URL` empty
  means same-origin, which the Vite dev proxy and the production nginx config
  both arrange, so SSE works without CORS.
- **Bundle** — vendor code is split into react / three / charts / motion
  chunks; the entry chunk is ~120 kB.
