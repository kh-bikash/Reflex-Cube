# API reference

Base URL: `http://localhost:8000`. An interactive version generated from the
code is at `/docs`, and the OpenAPI schema at `/openapi.json`.

There is **no authentication**. Every endpoint is open to anyone who can reach
the port — see [SECURITY.md](../SECURITY.md).

All request and response bodies are JSON unless stated otherwise.

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
  "storage_path": "/data/models"
}
```

`status` is `degraded` when the database is unreachable; `database` then holds
the error.

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

`422` for a blank name or prompt, or an unknown task. `500` if the training
worker could not be started — the job is marked `failed` with the reason
rather than left queued.

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
`data_ready`, `training_started`, `training`, `evaluating`, `saving`,
`completed`, `failed`.

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
API; it defaults to the Vite dev server ports. `*` is accepted but then
credentialed requests are disabled, because browsers reject that combination.

In Docker the web container proxies `/api` to the backend, so requests are
same-origin and CORS is not involved.
