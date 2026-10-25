# syntax=docker/dockerfile:1

# Reflex Cube API.
#
#   docker build -t reflex-cube-api ./backend                          # API only
#   docker build --build-arg INSTALL_ML=true -t reflex-cube-api:ml ./backend
#
# The default image serves the cube catalog, accounts, job tracking and log
# streaming in a container that builds in under a minute. INSTALL_ML adds the
# training pipeline and the model-backed cubes.
#
# This image is also what deploys to Hugging Face Spaces, which runs containers
# as uid 1000 and expects the app on $PORT (7860). Both are handled below, so
# the same Dockerfile serves local Docker, Compose and Spaces.

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Spaces runs the container as uid 1000 with HOME=/home/user. Matching that
# here means the same image runs unprivileged everywhere.
RUN useradd --create-home --uid 1000 --shell /bin/bash appuser

# libgomp is needed by torch; curl backs the healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Requirements first, so the dependency layer survives source changes.
COPY --chown=appuser:appuser requirements.txt requirements-ml.txt ./

ARG INSTALL_ML=false
RUN pip install --upgrade pip \
    && if [ "$INSTALL_ML" = "true" ]; then \
         pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
         && pip install -r requirements-ml.txt; \
       else \
         pip install -r requirements.txt; \
       fi

COPY --chown=appuser:appuser . .

# Runtime roots. /data is a volume mount locally; on Spaces it is container
# disk, which is why PUBLISH_MODELS_TO_HUB matters there.
ENV REFLEX_DATA_DIR=/data \
    STORAGE_PATH=/data/models \
    CUBE_STORAGE_PATH=/data/cubes \
    HF_HOME=/data/huggingface \
    DATABASE_URL=sqlite:////data/reflex.db \
    PORT=8000

RUN mkdir -p /data && chown -R appuser:appuser /app /data

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl --fail --silent "http://localhost:${PORT:-8000}/api/health" || exit 1

# $PORT is honoured so the same image runs on Spaces (7860) and on any PaaS
# that assigns a port at runtime.
CMD ["sh", "-c", "exec uvicorn app.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
