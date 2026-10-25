---
title: Reflex Cube API
emoji: 🧊
colorFrom: gray
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Prompt-to-model training API and Intelligence Cube registry
---

# Reflex Cube API

Backend for [Reflex Cube](https://github.com/kh-bikash/Reflex-Cube): turn a
natural-language prompt into a fine-tuned model, and run a registry of
task-specific AI cubes.

- Interactive API reference: [`/docs`](/docs)
- Health and capabilities: [`/api/health`](/api/health)
- Cube catalog: [`/api/cubes`](/api/cubes)

Sign in at `POST /api/auth/login` and send the token as
`Authorization: Bearer <token>`. Jobs belong to the account that created them.

## Required Space secrets

Set these under **Settings → Variables and secrets**.

| Name | Kind | Why |
| :--- | :--- | :--- |
| `JWT_SECRET` | Secret | Signs session tokens. At least 32 bytes — generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Without it, everyone is signed out on every restart. |
| `DATABASE_URL` | Secret | A hosted Postgres URL (Neon, Supabase). A Space's disk is wiped on rebuild, so SQLite would lose every account. |
| `CORS_ORIGINS` | Variable | Your frontend's origin, e.g. `https://reflex-cube.vercel.app`. |
| `HF_TOKEN` | Secret | A **write** token. Lets finished models be pushed to the Hub so they outlive the container. |
| `PUBLISH_MODELS_TO_HUB` | Variable | `true`. Strongly recommended here — see above. |
| `HUB_NAMESPACE` | Variable | The account or org trained models are published under. |

Optional: `MAX_TRAIN_SAMPLES`, `MAX_CONCURRENT_JOBS_TOTAL`, `ALLOW_REGISTRATION`,
`E2B_API_KEY`, `APIFY_API_TOKEN`, `SERPAPI_API_KEY`. Every variable is listed in
[`backend/.env.example`](https://github.com/kh-bikash/Reflex-Cube/blob/main/backend/.env.example).

## Notes on this hardware

Free Spaces give 2 vCPU and 16 GB of RAM, which is enough to fine-tune a small
model such as `distilbert-base-uncased` on a few thousand rows. It is not
enough for a large model or an uncapped dataset, so `MAX_TRAIN_SAMPLES` is
capped by default and concurrent jobs are limited.

Container storage does not survive a rebuild. Accounts live in Postgres and
trained models are pushed to the Hub, so nothing important is kept on disk.

A free Space sleeps after a period without traffic and wakes on the next
request, so the first call after an idle spell is slow.
