# syntax=docker/dockerfile:1

# Reflex Cube API.
#
# Builds the core (API-only) image by default — it starts in seconds and serves
# the cube catalog, job tracking and log streaming. Build with
# `--build-arg INSTALL_ML=true` to add the training pipeline and the cubes that
# run models locally; that image is several gigabytes.
#
#   docker build -t reflex-cube-api ./backend
#   docker build --build-arg INSTALL_ML=true -t reflex-cube-api:ml ./backend

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# libgomp is needed by torch; curl backs the healthcheck below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Requirements are copied alone so the dependency layer is cached across
# source changes.
COPY requirements.txt requirements-ml.txt ./

ARG INSTALL_ML=false
RUN pip install --upgrade pip \
    && if [ "$INSTALL_ML" = "true" ]; then \
         pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
         && pip install -r requirements-ml.txt; \
       else \
         pip install -r requirements.txt; \
       fi

COPY . .

# Runtime roots. Mount a volume at /data to persist models across containers.
ENV REFLEX_DATA_DIR=/data \
    STORAGE_PATH=/data/models \
    CUBE_STORAGE_PATH=/data/cubes \
    HF_HOME=/data/huggingface \
    DATABASE_URL=sqlite:////data/reflex.db

# Run unprivileged; /data must be writable by that user.
RUN useradd --create-home --uid 10001 reflex \
    && mkdir -p /data \
    && chown -R reflex:reflex /app /data
USER reflex

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl --fail --silent http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
