# Putting Reflex Cube online, for free

A complete, permanently free deployment. No trial credits, no card.

| Piece | Where | Why this one |
| :--- | :--- | :--- |
| API + training | **Hugging Face Spaces** (Docker) | 2 vCPU and 16 GB RAM on the free CPU tier, with no time limit and no card. That RAM is the deciding factor: most free tiers give 512 MB, which is not enough to fine-tune anything. It also sits next to the Hub, where the models and datasets already live. |
| Database | **Neon** or **Supabase** | Free Postgres that persists. A Space's disk is wiped on every rebuild, so SQLite would lose every account. |
| Trained models | **Hugging Face Hub** | Free, unlimited public model repos. This is what makes a trained model outlive the container. |
| Frontend | **Vercel** | Free static hosting with preview deploys. |

Total cost: nothing. The trade-off is that a free Space sleeps after a stretch
without traffic and takes a few seconds to wake.

---

## 1. Postgres

Create a free project at [neon.tech](https://neon.tech) (or
[supabase.com](https://supabase.com)) and copy the connection string. It looks
like:

```
postgresql://user:password@ep-xyz.region.aws.neon.tech/neondb
```

Paste it as-is. Reflex Cube rewrites the scheme to the driver it installs and
adds `sslmode=require`, so the string providers hand you works unmodified.

## 2. A Hugging Face write token

[huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) → New
token → **Write**.

One token does two jobs: it authenticates the Space deployment, and it lets the
server publish finished models. Keep it somewhere you can paste it twice.

## 3. The Space

1. [huggingface.co/new-space](https://huggingface.co/new-space)
2. Name it (for example `reflex-cube-api`), choose **Docker → Blank**, and
   leave the hardware on the free **CPU basic**.
3. Create it. It will be empty — the next step fills it.

### Deploy from GitHub

The repository ships a workflow that pushes `backend/` to the Space on every
change to `main`. In your GitHub repository settings:

- **Secrets → Actions → New secret**: `HF_TOKEN`, the write token from step 2.
- **Variables → Actions → New variable**: `HF_SPACE_ID`, e.g.
  `your-username/reflex-cube-api`.

Push to `main`, or run **Deploy backend to Hugging Face Spaces** from the
Actions tab. The workflow skips itself with a notice when either is missing, so
a fork without them does not fail.

<details>
<summary>Or push by hand</summary>

```bash
git clone https://huggingface.co/spaces/your-username/reflex-cube-api space
cp -r backend/. space/
cp deploy/huggingface/README.md space/README.md
cd space && rm -rf tests .venv
git add -A && git commit -m "Deploy Reflex Cube API" && git push
```

</details>

### Space settings

**Settings → Variables and secrets.** Secrets are hidden after saving;
variables are visible in the Space's configuration.

| Name | Kind | Value |
| :--- | :--- | :--- |
| `JWT_SECRET` | Secret | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DATABASE_URL` | Secret | The Postgres string from step 1 |
| `HF_TOKEN` | Secret | The write token from step 2 |
| `CORS_ORIGINS` | Variable | Your Vercel URL, e.g. `https://reflex-cube.vercel.app` |
| `PUBLISH_MODELS_TO_HUB` | Variable | `true` |
| `HUB_NAMESPACE` | Variable | Your Hugging Face username |

**Why each matters.** Without `JWT_SECRET` the server generates one per
process, so every restart signs everyone out. Without `DATABASE_URL` accounts
live in a SQLite file that the next rebuild deletes. Without
`PUBLISH_MODELS_TO_HUB` a trained model exists only until the container
recycles. `CORS_ORIGINS` must match your frontend's origin exactly, scheme
included, or the browser blocks every request.

### Training on this hardware

The Space needs the ML stack, which the default image omits. Add this build
argument in **Settings → Variables**:

| Name | Kind | Value |
| :--- | :--- | :--- |
| `INSTALL_ML` | Variable | `true` |

The first build then takes several minutes and the image is a few gigabytes.

Free CPU hardware comfortably fine-tunes a small model — `distilbert-base-uncased`
on a couple of thousand rows finishes in a few minutes. It will not train a
large one, so the server refuses anything over `MAX_MODEL_PARAMETERS`
(200M by default) with a message rather than being OOM-killed mid-run, and
stops a job at `MAX_TRAIN_SECONDS` (30 minutes) with the model saved.

Once the build finishes, check it:

```bash
curl https://your-username-reflex-cube-api.hf.space/api/health
```

```json
{ "status": "ok", "database": "ok", "cubes": 16,
  "auth_required": true, "training_available": true, "model_publishing": true }
```

`training_available: false` means `INSTALL_ML` did not take. `database` not
`"ok"` means `DATABASE_URL` is wrong or the database is unreachable.

## 4. The frontend on Vercel

1. [vercel.com/new](https://vercel.com/new) → import the repository.
2. Set **Root Directory** to `frontend`. Vercel reads `frontend/vercel.json`
   for the build command and the SPA rewrites.
3. Add one environment variable:

   | Name | Value |
   | :--- | :--- |
   | `VITE_API_URL` | `https://your-username-reflex-cube-api.hf.space` |

   No trailing slash. It is baked into the bundle at build time, so changing it
   needs a redeploy.
4. Deploy, then go back and set the Space's `CORS_ORIGINS` to the URL Vercel
   gave you.

## 5. Check it end to end

1. Open the Vercel URL and create an account.
2. Go to **Settings** and paste your Hugging Face write token, so models land
   in your own account rather than the server's.
3. Open **Studio**, enter `classify movie reviews as positive or negative`, and
   start a run.
4. Watch the log: it should resolve `text-classification`,
   `distilbert-base-uncased` and `imdb`, then stream loss.
5. When it finishes, the model appears under **Models** with a link to its Hub
   repository.

---

## If something is wrong

**Every request fails in the browser, but `curl` works.** `CORS_ORIGINS` does
not match. It must be the exact origin — `https://reflex-cube.vercel.app`, not
the bare domain and not with a trailing path.

**Signed out after every deploy.** `JWT_SECRET` is unset. The Space logs say so
on startup.

**Accounts vanish after a rebuild.** `DATABASE_URL` is unset, so it fell back to
SQLite on the container's disk.

**"Training is unavailable on this deployment."** The image was built without
`INSTALL_ML=true`. Set it and rebuild from **Settings → Factory rebuild**.

**A job fails with "above the 200M this server can fine-tune."** Working as
intended: the model would be OOM-killed. Name a smaller one in the prompt
("using distilbert") or raise `MAX_MODEL_PARAMETERS` on bigger hardware.

**The first request of the day takes half a minute.** A free Space sleeps when
idle and wakes on the next request. Paid hardware, or a scheduled ping, avoids
it.

**A `no such column` error after upgrading.** New columns are added
automatically on SQLite only. On Postgres, apply the change by hand or recreate
the schema with `python -m scripts.reset_db` — which deletes every account and
job record.

---

## Other hosts

Nothing here is specific to Spaces. The backend is a standard Docker image that
honours `$PORT` and runs unprivileged, so it also deploys to Render, Railway,
Fly.io or any container host. Spaces is the recommendation because it is the
only one whose free tier has enough memory to train on — the others need a paid
instance for anything beyond serving the API and the cubes.

Set the same environment variables wherever it runs;
[`backend/.env.example`](../backend/.env.example) lists all of them.
[`deployment.md`](deployment.md) covers Docker, Compose and the production
checklist.
