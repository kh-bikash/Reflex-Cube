"""Publish a finished model to the Hugging Face Hub.

Hosted containers have ephemeral disks: a checkpoint written to local storage
is gone the next time the instance recycles. Pushing to the Hub is what makes a
trained model something the user actually keeps — and it costs nothing, because
public model repos are free.

Publishing is best-effort. A push that fails never fails the training job; the
model is still on disk for as long as the instance lives, and the reason is
recorded on the job.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .config import HF_TOKEN, HUB_NAMESPACE, HUB_PRIVATE, PUBLISH_MODELS_TO_HUB
from .logging_config import get_logger

logger = get_logger(__name__)

#: Hub repo names allow letters, digits, hyphens, underscores and dots.
_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


class PublishError(RuntimeError):
    """Raised when a model could not be pushed."""


def is_enabled(user_token: str | None = None) -> bool:
    """True if a push would be attempted for this job."""
    return PUBLISH_MODELS_TO_HUB and bool(user_token or HF_TOKEN)


def repo_name(job_name: str, job_id: str) -> str:
    """Derive a stable, valid repo name from the job.

    The job id suffix keeps two models with the same name from colliding, and
    makes the repo traceable back to the run that produced it.
    """
    slug = _UNSAFE.sub("-", job_name.strip().lower()).strip("-._") or "model"
    # Hub repo names cap at 96 characters; leave room for the suffix.
    return f"{slug[:80]}-{job_id[:8]}"


def build_model_card(
    *,
    job_name: str,
    prompt: str,
    task: str,
    base_model: str,
    dataset: str,
    metrics: dict[str, float],
) -> str:
    """Write the README that becomes the model card on the Hub."""
    metric_rows = (
        "\n".join(f"| {key} | {value:.4f} |" for key, value in sorted(metrics.items()))
        or "| — | — |"
    )
    return f"""---
library_name: transformers
pipeline_tag: {task}
base_model: {base_model}
datasets:
  - {dataset.split(",")[0]}
tags:
  - reflex-cube
  - generated-from-prompt
---

# {job_name}

Fine-tuned with [Reflex Cube](https://github.com/kh-bikash/Reflex-Cube) from a
natural-language prompt.

## Prompt

> {prompt}

## How it was built

| | |
| :--- | :--- |
| Task | `{task}` |
| Base model | [`{base_model}`](https://huggingface.co/{base_model}) |
| Dataset | [`{dataset.split(",")[0]}`](https://huggingface.co/datasets/{dataset.split(",")[0]}) |

Reflex Cube read the prompt, resolved the task, selected the base model and
dataset above, and fine-tuned on a sample of the dataset.

## Results

| Metric | Value |
| :--- | ---: |
{metric_rows}

## Usage

```python
from transformers import pipeline

pipe = pipeline("{task}", model="REPO_ID")
print(pipe("your text here"))
```

## Limitations

Trained on a capped sample for a small number of epochs, to finish quickly on
modest hardware. Treat it as a starting point rather than a tuned production
model, and evaluate it on your own data before relying on it.
"""


def publish(
    *,
    model_dir: Path,
    job_id: str,
    job_name: str,
    prompt: str,
    task: str,
    base_model: str,
    dataset: str,
    metrics: dict[str, float],
    user_token: str | None = None,
    namespace: str | None = None,
) -> str:
    """Push `model_dir` to the Hub and return the repo id.

    Args:
        user_token: The owner's own write token, so the model lands in their
            account. Falls back to the server's `HF_TOKEN`.

    Raises:
        PublishError: if the Hub client is missing, no token is available, or
            the upload fails.
    """
    token = user_token or HF_TOKEN
    if not token:
        raise PublishError("No Hugging Face token available to publish with.")

    try:
        from huggingface_hub import HfApi
    except ImportError as exc:  # pragma: no cover - requires the ML extra
        raise PublishError("huggingface_hub is not installed.") from exc

    api = HfApi(token=token)
    name = repo_name(job_name, job_id)
    owner = namespace or HUB_NAMESPACE or None
    repo_id = f"{owner}/{name}" if owner else name

    try:
        created = api.create_repo(
            repo_id=repo_id, repo_type="model", private=HUB_PRIVATE, exist_ok=True
        )
        # create_repo resolves the namespace when we did not supply one.
        repo_id = created.repo_id if hasattr(created, "repo_id") else repo_id

        card = build_model_card(
            job_name=job_name,
            prompt=prompt,
            task=task,
            base_model=base_model,
            dataset=dataset,
            metrics=metrics,
        ).replace("REPO_ID", repo_id)
        (model_dir / "README.md").write_text(card, encoding="utf-8")

        logger.info("Publishing %s to the Hub as %s…", job_id, repo_id)
        api.upload_folder(
            folder_path=str(model_dir),
            repo_id=repo_id,
            repo_type="model",
            commit_message=f"Reflex Cube: {job_name}",
            # Checkpoints and logs are build artefacts, not the model.
            ignore_patterns=["checkpoints/*", "logs/*", "*.jsonl", "error.txt", "*.zip"],
        )
    except Exception as exc:
        raise PublishError(f"{type(exc).__name__}: {exc}") from exc

    logger.info("Published %s", repo_id)
    return repo_id


def hub_url(repo_id: str) -> str:
    """Browser URL for a published repo."""
    return f"https://huggingface.co/{repo_id}"


def describe() -> dict[str, Any]:
    """Publishing configuration, for the health endpoint."""
    return {
        "enabled": PUBLISH_MODELS_TO_HUB,
        "server_token": bool(HF_TOKEN),
        "namespace": HUB_NAMESPACE or None,
        "private": HUB_PRIVATE,
    }
