# Deployment

## Docker Compose (the quickest complete stack)

```bash
docker compose up --build
```

- API on `:8000`
- Web client on `:8080`, served by nginx, which proxies `/api` to the backend
  so the browser sees a single origin
- A named volume at `/data` keeps checkpoints, job logs, the SQLite database
  and the Hugging Face cache across rebuilds

The default backend image is **API-only**: it builds in under a minute and
gives you the catalog, job tracking, log streaming and the nine cubes that need
no ML stack. For training and the model-backed cubes:

```bash
INSTALL_ML=true docker compose up --build
```

That image is several gigabytes and installs the CPU torch wheels.

Credentials come from your shell or a `.env` next to `docker-compose.yml`:

```bash
HF_TOKEN=hf_…
E2B_API_KEY=…
APIFY_API_TOKEN=…
SERPAPI_API_KEY=…
```

## Images individually

```bash
docker build -t reflex-cube-api ./backend
docker build --build-arg INSTALL_ML=true -t reflex-cube-api:ml ./backend
docker build -t reflex-cube-web ./frontend
```

Both images run unprivileged and declare a healthcheck. The backend writes
everything under `/data`, so mount a volume there.

```bash
docker run -d -p 8000:8000 -v reflex_data:/data reflex-cube-api
```

### Pointing the client at a different API host

The API base URL is baked into the bundle at build time:

```bash
docker build --build-arg VITE_API_URL=https://api.example.com -t reflex-cube-web ./frontend
```

Leave it empty to keep requests same-origin and let nginx proxy them, which is
what the compose file does. Same-origin is preferable: server-sent events and
cookies work without any CORS configuration.

## Platform-as-a-service

`backend/Procfile` works on Heroku, Render, Railway and similar:

```
web: uvicorn app.api:app --host 0.0.0.0 --port ${PORT:-8000}
```

Set at minimum:

```bash
DATABASE_URL=postgresql+psycopg://…      # SQLite will not survive a restart
REFLEX_DATA_DIR=/var/data                # on a persistent disk
CORS_ORIGINS=https://your-frontend.example.com
```

The frontend is a static bundle — `npm run build` and serve `dist/` from
Netlify, Vercel, Cloudflare Pages or any static host. Configure a rewrite from
`/api/*` to your API, or set `VITE_API_URL` at build time and widen
`CORS_ORIGINS` to match.

## Production checklist

**Before exposing it to anyone**

- [ ] **Put authentication in front of the API.** It ships with none, and every
      endpoint — including model deletion — is open to whoever can reach the
      port.
- [ ] Set `CORS_ORIGINS` to your actual frontend origin. Not `*`.
- [ ] Terminate TLS at a reverse proxy or load balancer.
- [ ] Rate-limit `POST /api/models/create`: each call spawns a training
      process.

**Storage and data**

- [ ] `REFLEX_DATA_DIR` on a persistent disk with room for the HF cache
      (several GB) plus every checkpoint you keep.
- [ ] Move `DATABASE_URL` off SQLite for anything multi-process.
- [ ] Back up the database; checkpoints are reproducible from prompts, job
      history is not.

**Behaviour**

- [ ] Tune `MAX_TRAIN_SAMPLES` to the hardware. The default 2,000 finishes in
      minutes on CPU; `0` removes the cap and can run for hours.
- [ ] Leave `HF_TRUST_REMOTE_CODE=0` unless you specifically trust a dataset —
      it allows a Hub repository to execute its own loading script.
- [ ] Leave `BRAIN_EAGER_LOAD=0` unless you want startup to block on a
      multi-gigabyte download.
- [ ] Set `LOG_LEVEL=INFO` (or `WARNING`) and ship logs somewhere.

**Reverse proxy**

- [ ] Disable response buffering on `/api/logs/` or the SSE stream arrives in
      one lump at the end. The bundled nginx config sets `proxy_buffering off`
      and the backend sends `X-Accel-Buffering: no`.
- [ ] Raise read timeouts on `/api/` — a quiet epoch can last minutes.

## Verifying a deployment

```bash
curl -fsS https://your-api/api/health | jq
```

`status: ok`, the expected `version`, `database: ok`, and a `cubes` count of
16. If cubes are missing from a running container, exec in and run:

```bash
python -m scripts.check_env
```

It lists every optional package, which credentials are set (never their
values), and the exact import error for each unavailable cube.

## Operations

```bash
python -m scripts.cancel_jobs --dry-run   # list in-flight jobs
python -m scripts.cancel_jobs             # mark them cancelled
python -m scripts.reset_db --yes          # drop and recreate the schema
```

Jobs orphaned by a restart are reaped automatically on startup: the training
subprocess is detached and does not survive the server, so anything still
active is marked failed rather than left queued forever.
