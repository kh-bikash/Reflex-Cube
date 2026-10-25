"""Prompt-to-model training pipeline.

`run_training_job` is what `train_worker.py` executes in its own process:
it resolves a task, model and dataset from the prompt, downloads the real
dataset, fine-tunes, evaluates, and saves the checkpoint — streaming progress
into a JSONL file that the SSE endpoint tails and into the job row the status
endpoint reads.

torch/transformers/datasets are imported *inside* the functions that need them.
The module therefore imports on a machine without the ML extra, which lets the
API and the test suite reason about job state without a multi-gigabyte install.
"""

from __future__ import annotations

import contextlib
import json
import time
import traceback
from pathlib import Path
from typing import Any

from .config import (
    MAX_EVAL_SAMPLES,
    MAX_MODEL_PARAMETERS,
    MAX_TRAIN_SAMPLES,
    MAX_TRAIN_SECONDS,
    STORAGE_PATH,
    TRAIN_BATCH_SIZE,
    TRAIN_EPOCHS,
    TRAIN_LEARNING_RATE,
    TRAIN_MAX_LENGTH,
    TRUST_REMOTE_CODE,
)
from .db import session_scope
from .logging_config import get_logger
from .models import JobStatusValue, TrainingJob
from .utils import TRAINING_LOG_NAME, append_jsonl

logger = get_logger(__name__)

#: Canonical Hugging Face task name per task the UI can request.
HF_TASK_ALIASES = {
    "sentiment-analysis": "text-classification",
    "classification": "text-classification",
    "ner": "token-classification",
    "dialogue": "text-generation",
}

#: Column names searched, in order, when mapping a dataset onto model inputs.
TEXT_COLUMNS = ("text", "document", "sentence", "content", "article", "context", "question")
TARGET_COLUMNS = ("summary", "highlights", "target", "translation", "answers")
LABEL_COLUMNS = ("label", "labels", "label_ids", "ner_tags", "class", "category", "sentiment")


# ---------------------------------------------------------------------------
# Job state
# ---------------------------------------------------------------------------


def update_job(job_id: str, **fields: Any) -> None:
    """Patch a job row. Unknown or `None` values are ignored.

    `error` appends rather than replaces, so a fallback attempt does not erase
    the reason the first attempt failed.
    """
    error_msg = fields.pop("error_msg", None)
    with session_scope() as session:
        job = session.get(TrainingJob, job_id)
        if job is None:
            logger.warning("update_job: no job %s", job_id)
            return
        for key, value in fields.items():
            if value is not None and hasattr(job, key):
                setattr(job, key, value)
        if error_msg:
            job.error = f"{job.error}\n{error_msg}" if job.error else str(error_msg)


# ---------------------------------------------------------------------------
# Task resolution
# ---------------------------------------------------------------------------


def detect_task(prompt: str, requested: str | None = None) -> str:
    """Resolve the Hugging Face task for a prompt.

    An explicit request wins; otherwise keyword heuristics decide, defaulting to
    text classification — the task with the widest dataset coverage.
    """
    if requested and requested not in ("auto", ""):
        return HF_TASK_ALIASES.get(requested, requested)

    lowered = prompt.lower()
    if "summar" in lowered:
        return "summarization"
    if "translat" in lowered:
        return "translation"
    if any(word in lowered for word in ("sentiment", "opinion", "review", "polarity")):
        return "text-classification"
    if any(word in lowered for word in ("entity", "ner", "token tag", "part of speech")):
        return "token-classification"
    if any(word in lowered for word in ("question", "answer", "qa ")):
        return "question-answering"
    if any(
        word in lowered
        for word in ("classif", "categor", "label", "detect", "identify", "spam", "topic")
    ):
        return "text-classification"
    if any(word in lowered for word in ("generat", "write", "story", "chat", "poem")):
        return "text-generation"
    return "text-classification"


def load_dataset_strict(name: str):
    """Download a real dataset from the Hub. Never substitutes mock data.

    `name` may carry a config after a comma, e.g. `"wikitext,wikitext-2-raw-v1"`.
    """
    from datasets import load_dataset

    logger.info("Fetching dataset %r from the Hugging Face Hub…", name)
    try:
        if "," in name:
            base, config = name.split(",", 1)
            dataset = load_dataset(base, config, trust_remote_code=TRUST_REMOTE_CODE)
        else:
            dataset = load_dataset(name, trust_remote_code=TRUST_REMOTE_CODE)
    except Exception as exc:
        raise RuntimeError(f"Could not fetch dataset {name!r}: {exc}") from exc

    logger.info("Loaded %r.", name)
    return dataset


def _pick_column(available: Any, candidates: tuple[str, ...]) -> str | None:
    """First candidate present in `available`, else None."""
    return next((name for name in candidates if name in available), None)


def _label_metadata(features: Any) -> tuple[int, dict[int, str], dict[str, int]]:
    """Derive label count and id<->name maps from a dataset's features."""
    for column in ("label", "labels", "ner_tags"):
        feature = features.get(column) if hasattr(features, "get") else None
        if feature is None:
            continue
        # Sequence features (NER) carry the class list on `.feature`.
        inner = getattr(feature, "feature", feature)
        names = getattr(inner, "names", None)
        if names:
            return len(names), dict(enumerate(names)), {n: i for i, n in enumerate(names)}
        num_classes = getattr(inner, "num_classes", None)
        if num_classes:
            return (
                num_classes,
                {i: f"LABEL_{i}" for i in range(num_classes)},
                {f"LABEL_{i}": i for i in range(num_classes)},
            )
    return 2, {0: "LABEL_0", 1: "LABEL_1"}, {"LABEL_0": 0, "LABEL_1": 1}


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------


def _build_callback(log_event, job_id: str):
    """Trainer callback that mirrors each log line into JSONL and the DB."""
    from transformers import TrainerCallback

    class StreamLogCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kwargs):
            if not logs:
                return
            event = {
                "stage": "training",
                "step": logs.get("step", state.global_step),
                "epoch": round(float(logs.get("epoch", 0.0)), 4),
                **{k: v for k, v in logs.items() if isinstance(v, (int, float))},
            }
            log_event(event)

            total = state.max_steps or 0
            # Training occupies the 50-95% band; 0-50 is setup, 95-100 is saving.
            progress = 50 + int(45 * state.global_step / total) if total else 50
            update_job(
                job_id,
                epoch=float(logs.get("epoch", 0.0)),
                loss=logs.get("loss"),
                progress=min(progress, 95),
            )

    return StreamLogCallback()


def _compute_metrics(eval_pred):
    """Accuracy for single-label classification."""
    import numpy as np

    logits, labels = eval_pred
    if isinstance(logits, tuple):
        logits = logits[0]
    predictions = np.argmax(logits, axis=-1)
    labels = np.asarray(labels)
    if predictions.shape != labels.shape:
        return {}
    mask = labels != -100  # token classification pads with -100
    if not mask.any():
        return {}
    return {"accuracy": float((predictions[mask] == labels[mask]).mean())}


def run_training_job(job_data: dict[str, Any], job_id: str) -> None:
    """Run one prompt-to-model job end to end.

    Always reaches a terminal job status: on any failure the job is marked
    `failed`, the traceback is written next to the checkpoint, and a `failed`
    event is appended to the log so the SSE stream can close.
    """
    prompt = (job_data.get("prompt") or "").strip()

    # Bound before the try block: the previous version built these inside it,
    # so a failure during setup raised NameError in the handler and buried the
    # real error.
    job_dir = Path(STORAGE_PATH) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    log_file = job_dir / TRAINING_LOG_NAME

    def log_event(event: dict[str, Any]) -> None:
        try:
            append_jsonl(log_file, event)
        except OSError as exc:
            logger.warning("Could not write training log: %s", exc)

    try:
        log_event({"stage": "initializing", "msg": "Job received by trainer"})
        update_job(job_id, status=JobStatusValue.INITIALIZING, progress=5)

        # 1. Resolve the task.
        update_job(job_id, status=JobStatusValue.ANALYZING_PROMPT, progress=15)
        task = detect_task(prompt, job_data.get("task"))
        logger.info("Resolved task %r for prompt %r", task, prompt[:80])
        log_event({"stage": "task_resolved", "task": task})

        # 2. Resolve a base model and a dataset.
        from .interpreter import interpreter

        config = interpreter.parse_and_resolve(prompt, task)
        model_name = config["model_name"]
        dataset_name = config["dataset_name"]
        update_job(job_id, task=task, model_name=model_name, dataset_name=dataset_name)
        log_event({"stage": "resolved", "model": model_name, "dataset": dataset_name})

        # 3. Download the dataset, falling back once on failure.
        update_job(job_id, status=JobStatusValue.LOADING_DATA, progress=20)
        try:
            raw = load_dataset_strict(dataset_name)
        except RuntimeError as exc:
            fallback = interpreter.get_fallback_dataset(task, prompt)
            logger.warning("Dataset %r failed (%s); trying %r", dataset_name, exc, fallback)
            log_event({"stage": "dataset_fallback", "from": dataset_name, "to": fallback})
            update_job(job_id, error_msg=f"Dataset {dataset_name!r} unavailable: {exc}")
            dataset_name = fallback
            update_job(job_id, dataset_name=dataset_name)
            raw = load_dataset_strict(dataset_name)

        train_split, eval_split = _split(raw)
        log_event(
            {
                "stage": "data_ready",
                "dataset": dataset_name,
                "train_rows": len(train_split),
                "eval_rows": len(eval_split) if eval_split is not None else 0,
            }
        )

        # 4. Tokenize, build the model, train.
        update_job(job_id, status=JobStatusValue.TRAINING, progress=45)
        metrics = _train(
            job_id=job_id,
            job_dir=job_dir,
            task=task,
            model_name=model_name,
            train_split=train_split,
            eval_split=eval_split,
            log_event=log_event,
        )

        # Publish before marking complete, so a job reported as finished has
        # its model somewhere that outlives this container.
        hub_repo_id = _publish(
            job_id=job_id,
            job_dir=job_dir,
            job_name=job_data.get("name") or "model",
            prompt=prompt,
            task=task,
            base_model=model_name,
            dataset=dataset_name,
            metrics=metrics,
            log_event=log_event,
        )

        update_job(
            job_id,
            status=JobStatusValue.COMPLETED,
            progress=100,
            result_path=str(job_dir),
            hub_repo_id=hub_repo_id,
            accuracy=metrics.get("eval_accuracy"),
            loss=metrics.get("eval_loss") or metrics.get("train_loss"),
        )
        log_event(
            {
                "stage": "completed",
                "job_id": job_id,
                "task": task,
                "hub_repo_id": hub_repo_id,
                **metrics,
            }
        )
        logger.info("Job %s completed (%s).", job_id, task)

    except Exception as exc:
        tb = traceback.format_exc()
        logger.error("Job %s failed: %s", job_id, exc)
        update_job(job_id, status=JobStatusValue.FAILED, error_msg=str(exc))
        log_event({"stage": "failed", "error": str(exc)})
        with contextlib.suppress(OSError):
            (job_dir / "error.txt").write_text(tb, encoding="utf-8")


class TrainingBudgetExceeded(RuntimeError):
    """Raised when a run passes its wall-clock budget."""


def _build_budget_callback(deadline: float | None):
    """Stop training once `deadline` passes, so a job cannot run forever."""
    from transformers import TrainerCallback

    class BudgetCallback(TrainerCallback):
        def on_step_end(self, args, state, control, **kwargs):
            if deadline is not None and time.monotonic() > deadline:
                # Asking the Trainer to stop lets it finish the step and save
                # cleanly, rather than killing it mid-update.
                control.should_training_stop = True
                self.exceeded = True
            return control

        exceeded = False

    return BudgetCallback()


def check_model_fits(model) -> None:
    """Refuse a model too large for this instance to fine-tune.

    Raises:
        RuntimeError: with a message naming the model's size and the limit.
    """
    if MAX_MODEL_PARAMETERS <= 0:
        return
    parameters = sum(p.numel() for p in model.parameters())
    if parameters > MAX_MODEL_PARAMETERS:
        raise RuntimeError(
            f"This model has {parameters / 1e6:.0f}M parameters, above the "
            f"{MAX_MODEL_PARAMETERS / 1e6:.0f}M this server can fine-tune. "
            "Ask for a smaller architecture in the prompt (for example "
            "'using distilbert'), or raise MAX_MODEL_PARAMETERS."
        )


def _publish(
    *, job_id, job_dir, job_name, prompt, task, base_model, dataset, metrics, log_event
) -> str | None:
    """Push the finished model to the Hub, if publishing is configured.

    Best-effort: a push failure is recorded on the job but does not fail it.
    The model is still on disk for as long as this instance lives.
    """
    from . import publisher

    token = _owner_hub_token(job_id)
    if not publisher.is_enabled(token):
        return None

    update_job(job_id, progress=99)
    log_event({"stage": "publishing"})
    try:
        repo_id = publisher.publish(
            model_dir=job_dir,
            job_id=job_id,
            job_name=job_name,
            prompt=prompt,
            task=task,
            base_model=base_model,
            dataset=dataset,
            metrics=metrics,
            user_token=token,
        )
    except publisher.PublishError as exc:
        logger.warning("Job %s: could not publish: %s", job_id, exc)
        update_job(job_id, error_msg=f"Model trained, but publishing failed: {exc}")
        log_event({"stage": "publish_failed", "error": str(exc)})
        return None

    log_event({"stage": "published", "repo_id": repo_id, "url": publisher.hub_url(repo_id)})
    return repo_id


def _owner_hub_token(job_id: str) -> str | None:
    """The job owner's own Hub token, so the model lands in their account."""
    from .models import User

    with session_scope() as session:
        job = session.get(TrainingJob, job_id)
        if job is None or not job.user_id:
            return None
        user = session.get(User, job.user_id)
        return user.hf_token if user else None


def _split(raw):
    """Pick train/eval splits and cap them to the configured sample budgets."""
    if hasattr(raw, "keys"):
        train = raw.get("train") or raw[next(iter(raw.keys()))]
        evaluation = raw.get("test") or raw.get("validation")
    else:
        train, evaluation = raw, None

    if MAX_TRAIN_SAMPLES > 0 and len(train) > MAX_TRAIN_SAMPLES:
        # Shuffle first: many corpora are ordered by label, and head-slicing an
        # ordered corpus yields a single-class training set.
        train = train.shuffle(seed=42).select(range(MAX_TRAIN_SAMPLES))

    if evaluation is not None and MAX_EVAL_SAMPLES > 0:
        size = min(len(evaluation), MAX_EVAL_SAMPLES)
        evaluation = evaluation.shuffle(seed=42).select(range(size))
    elif MAX_EVAL_SAMPLES <= 0:
        evaluation = None

    return train, evaluation


def _train(*, job_id, job_dir, task, model_name, train_split, eval_split, log_event):
    """Tokenize, build the right model head, fine-tune and save."""
    import torch
    from transformers import (
        AutoModelForCausalLM,
        AutoModelForSeq2SeqLM,
        AutoModelForSequenceClassification,
        AutoModelForTokenClassification,
        AutoTokenizer,
        DataCollatorForTokenClassification,
        Trainer,
        TrainingArguments,
    )

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        # GPT-style tokenizers have no pad token; reuse EOS so batching works.
        tokenizer.pad_token = tokenizer.eos_token

    columns = train_split.column_names
    text_col = _pick_column(columns, TEXT_COLUMNS) or columns[0]
    label_col = _pick_column(columns, LABEL_COLUMNS)
    target_col = next((c for c in TARGET_COLUMNS if c in columns and c != text_col), None)
    num_labels, id2label, label2id = _label_metadata(train_split.features)

    def preprocess(examples):
        texts = [str(value) if value is not None else "" for value in examples[text_col]]
        encoded = tokenizer(
            texts, truncation=True, padding="max_length", max_length=TRAIN_MAX_LENGTH
        )

        if task == "text-generation":
            encoded["labels"] = [ids.copy() for ids in encoded["input_ids"]]
        elif task in ("summarization", "translation"):
            if target_col:
                targets = [
                    str(value) if value is not None else "" for value in examples[target_col]
                ]
            else:
                targets = texts
            # `text_target=` replaces the deprecated `as_target_tokenizer()`.
            encoded["labels"] = tokenizer(
                text_target=targets,
                truncation=True,
                padding="max_length",
                max_length=TRAIN_MAX_LENGTH,
            )["input_ids"]
        elif label_col:
            encoded["labels"] = examples[label_col]
        else:
            encoded["labels"] = [0] * len(texts)
        return encoded

    tokenized_train = train_split.map(
        preprocess, batched=True, remove_columns=train_split.column_names
    )
    tokenized_eval = (
        eval_split.map(preprocess, batched=True, remove_columns=eval_split.column_names)
        if eval_split is not None
        else None
    )

    data_collator = None
    compute_metrics = None

    if task in ("summarization", "translation"):
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    elif task == "text-generation":
        model = AutoModelForCausalLM.from_pretrained(model_name)
    elif task == "token-classification":
        model = AutoModelForTokenClassification.from_pretrained(
            model_name, num_labels=num_labels, id2label=id2label, label2id=label2id
        )
        # Previously keyed off a task name the pipeline never produced, so the
        # collator was never attached and ragged tag sequences failed to batch.
        data_collator = DataCollatorForTokenClassification(tokenizer)
        compute_metrics = _compute_metrics
    else:
        model = AutoModelForSequenceClassification.from_pretrained(
            model_name, num_labels=num_labels, id2label=id2label, label2id=label2id
        )
        compute_metrics = _compute_metrics

    if tokenizer.pad_token_id is not None:
        model.config.pad_token_id = tokenizer.pad_token_id

    check_model_fits(model)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    logger.info(
        "Training %s on %s: %d rows, %d labels",
        model_name,
        device,
        len(tokenized_train),
        num_labels,
    )

    args = TrainingArguments(
        output_dir=str(job_dir / "checkpoints"),
        num_train_epochs=TRAIN_EPOCHS,
        per_device_train_batch_size=TRAIN_BATCH_SIZE,
        per_device_eval_batch_size=TRAIN_BATCH_SIZE,
        learning_rate=TRAIN_LEARNING_RATE,
        logging_dir=str(job_dir / "logs"),
        logging_steps=10,
        report_to="none",
        save_strategy="no",  # the final model is saved explicitly below
        # Progress bars write raw control codes into the captured worker log.
        disable_tqdm=True,
        fp16=device == "cuda",
    )

    deadline = time.monotonic() + MAX_TRAIN_SECONDS if MAX_TRAIN_SECONDS > 0 else None
    budget = _build_budget_callback(deadline)

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=tokenized_train,
        eval_dataset=tokenized_eval,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=[_build_callback(log_event, job_id), budget],
    )

    log_event({"stage": "training_started", "task": task, "model": model_name})
    train_result = trainer.train()

    if budget.exceeded:
        # The model is still usable — it just saw fewer steps than planned —
        # so finish the run and say so rather than discarding the work.
        logger.warning("Job %s hit its %ds budget and stopped early.", job_id, MAX_TRAIN_SECONDS)
        log_event(
            {
                "stage": "budget_reached",
                "msg": (
                    f"Stopped after {MAX_TRAIN_SECONDS}s, the time budget for one run. "
                    "The model was saved with the steps it completed."
                ),
            }
        )
        update_job(job_id, error_msg=f"Training stopped at the {MAX_TRAIN_SECONDS}s budget.")

    metrics: dict[str, float] = {
        "train_loss": float(train_result.training_loss)
        if train_result.training_loss is not None
        else 0.0
    }
    if tokenized_eval is not None:
        update_job(job_id, progress=96)
        log_event({"stage": "evaluating"})
        for key, value in trainer.evaluate().items():
            if isinstance(value, (int, float)):
                metrics[key] = float(value)

    update_job(job_id, progress=98)
    log_event({"stage": "saving", "path": str(job_dir)})
    model.save_pretrained(str(job_dir))
    tokenizer.save_pretrained(str(job_dir))
    (job_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    return metrics
