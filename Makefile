# Reflex Cube developer tasks.
#
#   make help      list targets
#   make setup     install backend and frontend dependencies
#   make dev       run the API and the web client together
#   make check     everything CI runs

SHELL := /bin/bash
PY ?= python3
VENV := backend/.venv
BIN := $(VENV)/bin

.DEFAULT_GOAL := help
.PHONY: help setup setup-backend setup-backend-ml setup-frontend \
        dev dev-backend dev-frontend \
        check lint lint-backend lint-frontend format typecheck test test-backend \
        build audit env docker-up docker-down clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---- Setup -----------------------------------------------------------------

setup: setup-backend setup-frontend ## Install all dependencies (API-only backend)

setup-backend: ## Create backend/.venv and install the core + dev requirements
	$(PY) -m venv $(VENV)
	$(BIN)/pip install --upgrade pip
	$(BIN)/pip install -r backend/requirements.txt -r backend/requirements-dev.txt

setup-backend-ml: setup-backend ## Also install the training/ML stack (large)
	$(BIN)/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
	$(BIN)/pip install -r backend/requirements-ml.txt

setup-frontend: ## Install frontend dependencies from the lockfile
	cd frontend && npm ci

# ---- Run -------------------------------------------------------------------

dev: ## Run the API and the web client together (Ctrl-C stops both)
	@trap 'kill 0' EXIT INT TERM; \
	$(MAKE) dev-backend & \
	$(MAKE) dev-frontend & \
	wait

dev-backend: ## Run the API with reload on :8000
	cd backend && .venv/bin/uvicorn app.api:app --reload --host 0.0.0.0 --port 8000

dev-frontend: ## Run the Vite dev server on :8080
	cd frontend && npm run dev

# ---- Quality ---------------------------------------------------------------

check: lint typecheck test ## Run every check CI runs

lint: lint-backend lint-frontend ## Lint both sides

lint-backend: ## ruff check + ruff format --check
	cd backend && .venv/bin/ruff check .
	cd backend && .venv/bin/ruff format --check .

lint-frontend: ## ESLint
	cd frontend && npm run lint

format: ## Autoformat and autofix both sides
	cd backend && .venv/bin/ruff check --fix .
	cd backend && .venv/bin/ruff format .
	cd frontend && npm run lint:fix

typecheck: ## TypeScript project-wide check
	cd frontend && npm run typecheck

test: test-backend ## Run the test suites

test-backend: ## pytest with coverage
	cd backend && .venv/bin/pytest --cov=app --cov-report=term-missing

audit: ## Report known vulnerabilities in frontend dependencies
	cd frontend && npm audit --audit-level=high

env: ## Report installed optional dependencies, paths and credentials
	cd backend && .venv/bin/python -m scripts.check_env

build: ## Build the production frontend bundle
	cd frontend && npm run build

# ---- Docker ----------------------------------------------------------------

docker-up: ## Build and start the full stack (API :8000, web :8080)
	docker compose up --build

docker-down: ## Stop the stack and remove its containers
	docker compose down

# ---- Housekeeping ----------------------------------------------------------

clean: ## Remove build output, caches and test artefacts
	rm -rf frontend/dist frontend/node_modules/.vite
	rm -rf backend/.pytest_cache backend/.ruff_cache backend/.coverage backend/coverage.xml backend/htmlcov
	find backend -name '__pycache__' -type d -prune -exec rm -rf {} +
