# API reference

Base URL: `http://localhost:8000`. An interactive version generated from the
code is at `/docs`, and the OpenAPI schema at `/openapi.json`.

## Authentication

Reading the catalog and the health endpoint is open. Everything that spends CPU
or touches private data needs an account:

```bash
TOKEN=$(curl -sS -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…"}' \
  | python -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -H "Authorization: Bearer $TOKEN" $BASE/api/models/all
```

Tokens are JWTs, valid for seven days by default (`ACCESS_TOKEN_TTL_MINUTES`).
A `401` means the token is missing, expired, or was signed by a server that has
since restarted with a different secret — sign in again.

Jobs belong to the account that created them. Another user's job reads as
`404`, not `403`: whether a given id exists is not something one user should
learn about another's work.

A deployment can set `REQUIRE_AUTH=0` for a single-user local install, in which
case the protected endpoints accept anonymous requests. `GET /api/health`
reports which mode is in force.

All request and response bodies are JSON unless stated otherwise.

---

## Accounts

### `POST /api/auth/register`

```json
{ "email": "you@example.com", "password": "at-least-8-chars", "display_name": "Ada" }
```

→ `201`

```json
{
  "access_token": "eyJ…",
  "token_type": "bearer",
  "expires_in": 604800,
  "user": { "id": "…", "email": "you@example.com", "display_name": "Ada",
            "has_hf_token": false }
}
```

`409` if the address is taken, `422` for an invalid address or a password under
`MIN_PASSWORD_LENGTH`, `403` if `ALLOW_REGISTRATION=0`.

### `POST /api/auth/login`

```json
{ "email": "you@example.com", "password": "…" }
```

→ the same shape as register. `401` for a bad password — and identically for an
unknown address, so the endpoint cannot be used to discover which addresses
have accounts.

### `GET /api/auth/me`

The signed-in account. `401` without a valid token.

### `PATCH /api/auth/me`

```json
{
  "display_name": "Ada Lovelace",
  "hf_token": "hf_…",
  "current_password": "…",
  "new_password": "…"
}
```

Every field is optional. `hf_token` is a Hugging Face **write** token, used to
publish your trained models to your own account; it is write-only and never
returned. Send an empty string to remove it. Changing the password requires
`current_password`, and `403` says it was wrong.

---

## System

### `GET /api/health`

Liveness and dependency check. Used by the Docker healthcheck.

```json
{
  "status": "ok",
  "version": "2.0.0",
  "database": "ok",
  "cubes": 16,
  "storage_path": "/data/models",
  "auth_required": true,
  "registration_open": true,
  "training_available": true,
  "model_publishing": true
}
```

`status` is `degraded` when the database is unreachable; `database` then holds
the error. The four capability flags let a client explain itself before a user
hits a wall: whether to show a sign-in screen, whether signups are open,
whether the ML stack is installed (so training can work at all), and whether
finished models are pushed to the Hub.

### `GET /`

```json
{ "status": "ok", "service": "reflex-cube-api", "version": "2.0.0" }
```

### `POST /api/newsletter/subscribe`

```json
{ "email": "reader@example.com" }
```

→ `{"status": "subscribed", "email": "reader@example.com"}`, or
`already_subscribed`. Addresses are lower-cased. An invalid address is `422`.

### `POST /api/cubes/pdf`

Renders markdown to a downloadable PDF. Used by the Research console to export
a report.

```json
{ "title": "Research Report", "markdown": "# Findings\n\n…" }
```

→ `application/pdf`. Returns `503` if `markdown` and `xhtml2pdf` are not
installed.

---

## Training jobs

### `POST /api/models/create`

Queues a prompt for background model generation.

```json
{
  "name": "review-sentiment",
  "prompt": "classify movie reviews as positive or negative",
  "task": "auto"
}
```

`task` is optional. `auto` (or omitted) infers it from the prompt; otherwise
one of `text-classification`, `sentiment-analysis`, `token-classification`,
`text-generation`, `summarization`, `translation`, `question-answering`.

→ `202 {"job_id": "…", "status": "queued"}`

`422` for a blank name or prompt, or an unknown task. `429` when you already
have a job training, or the instance is at capacity — training is CPU-bound and
a small box has two cores. `500` if the worker could not be started; the job is
marked `failed` with the reason rather than left queued.

### `GET /api/training/status/{job_id}`

```json
{
  "id": "3f1c…",
  "name": "review-sentiment",
  "task": "text-classification",
  "status": "training",
  "progress": 68,
  "epoch": 0.75,
  "loss": 0.31,
  "accuracy": null,
  "model_name": "distilbert-base-uncased",
  "dataset_name": "imdb",
  "result_path": null,
  "hub_repo_id": "your-name/review-sentiment-3f1c4e2a",
  "error": null,
  "created_at": "2026-10-25T18:02:11Z",
  "updated_at": "2026-10-25T18:09:40Z"
}
```

**Status values**

| Status | Meaning |
| :--- | :--- |
| `queued` | Accepted, worker not yet started |
| `initializing` | Worker running, setting up |
| `analyzing_prompt` | Resolving task, model and dataset |
| `loading_data` | Downloading the dataset |
| `training` | Fine-tuning |
| `completed` | Done; `result_path` is set |
| `failed` | Stopped; `error` explains why |
| `cancelled` | Cancelled by an operator |

Progress is 0–50 for setup, 50–95 during training, 95–100 while saving.

`400` for a malformed id, `404` if unknown.

### `GET /api/logs/{job_id}`

Server-sent events. Each `data:` frame is one JSONL line from the job's
training log:

```
data: {"stage": "initializing", "msg": "Job received by trainer"}
data: {"stage": "resolved", "model": "distilbert-base-uncased", "dataset": "imdb"}
data: {"stage": "training", "step": 50, "epoch": 0.4, "loss": 0.43}
data: {"stage": "completed", "job_id": "3f1c…", "eval_accuracy": 0.91}

event: end
data: {}
```

The stream **closes** once the job reaches a terminal state and the log has
been drained. An SSE comment (`: keep-alive`) is sent every 15 idle seconds.

```js
const stream = new EventSource(`/api/logs/${jobId}`);
stream.onmessage = (e) => console.log(JSON.parse(e.data));
stream.addEventListener("end", () => stream.close());
```

**Stages:** `initializing`, `task_resolved`, `resolved`, `dataset_fallback`,
`data_ready`, `training_started`, `training`, `budget_reached`, `evaluating`,
`saving`, `publishing`, `published`, `publish_failed`, `completed`, `failed`.

`budget_reached` means the run hit `MAX_TRAIN_SECONDS` and stopped early; the
model is still saved with the steps it completed.

### `GET /api/models/all`

Every job, newest first, each in the `GET /api/training/status` shape.

### `POST /api/models/{job_id}/predict`

```json
{ "text": "An absolute triumph of a film." }
```

→ `{"result": [{"label": "pos", "score": 0.98}]}` — the shape is whatever the
pipeline for the job's task returns.

`409` if the model is not ready, `404` if the job is unknown, `503` if
`transformers` is not installed on the server.

### `GET /api/models/download/{job_id}`

The checkpoint directory as a zip (`application/zip`): model weights,
tokenizer, config and `metrics.json`. The archive is cached and rebuilt only
when a source file is newer. `409` if the model is not ready.

`GET /api/models/download-zip-stream/{job_id}` is an alias.

### `POST /api/models/download-zip/{job_id}`

→ `{"url": "/api/models/download/<job_id>"}`. `409` unless the job is
`completed`.

### `DELETE /api/models/{job_id}`

Deletes the job row, its artefact directory and any cached archive.

→ `{"status": "deleted", "id": "…"}`

---

## Cubes

### `GET /api/cubes`

```json
{
  "cubes": [
    { "id": "forge", "name": "Forge Cube", "description": "LLM training sandbox…" }
  ],
  "count": 16
}
```

Answered from declarations — no cube is imported, so this works on an install
without the ML stack.

### `GET /api/cubes/{cube_id}`

One catalog entry. `404` if unknown.

### `POST /api/cubes/run`

```json
{ "cube_id": "alpha", "input": { "text": "AAPL" } }
```

`input` is an object for registry cubes and may be a plain string for the
agent-backed ones.

**The response body is the cube's own payload, verbatim.** By convention it
carries `status`:

```json
{
  "status": "success",
  "ticker": "AAPL",
  "price": 231.4,
  "pe_ratio": 35.2,
  "forward_pe": 29.8,
  "rating": "HOLD",
  "thesis": "…"
}
```

A cube failure is `200` with `{"status": "error", "message": "…"}`, because
that is the shape every console renders. Status codes are reserved for
request- and server-level problems:

| Code | When |
| :--- | :--- |
| `422` | Missing or blank `cube_id` |
| `503` | The cube is declared but failed to import (the detail names the error), or the agent fallback is unavailable |

Agent-backed cubes (`research`, `social`) return
`{"status": "success", "result": "<markdown>"}`.

**Common payloads**

| Cube | Example input |
| :--- | :--- |
| `alpha` | `{"text": "TSLA"}` |
| `chef` | `{"image": "data:image/jpeg;base64,…"}` or `{"text": "eggs, spinach"}` |
| `ledger` | `{"action": "audit", "invoices": "…", "bank_feed": "…"}` |
| `sentinel` | `{"action": "get_rules"}` · `{"action": "analyze", "text": "…"}` |
| `talent` | `{"action": "train", "jd": "…"}` then `{"action": "screen", "criteria": {…}, "candidates": "…"}` |
| `forge` | `{"action": "build"\|"train"\|"generate"\|"save"\|"list"\|"load"\|"stop"}` |
| `travel` | `{"destination": "Kyoto", "vibe": "Cultural", "budget": "Mid-Range"}` |

The cube's own `run()` is the authority on its input; see
`backend/app/cubes/<id>.py`.

---

## Errors

FastAPI's standard shape:

```json
{ "detail": "Job not found" }
```

Validation failures (`422`) list the offending fields:

```json
{
  "detail": [
    { "loc": ["body", "prompt"], "msg": "String should have at least 1 character",
      "type": "string_too_short" }
  ]
}
```

## CORS

`CORS_ORIGINS` (comma-separated) controls which browser origins may call the
API; it defaults to the Vite dev server ports. It must match your frontend's
origin exactly, scheme included. `*` is accepted but then credentialed requests
are disabled, because browsers reject that combination.

In Docker the web container proxies `/api` to the backend, so requests are
same-origin and CORS is not involved.
