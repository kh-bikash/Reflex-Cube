#!/usr/bin/env python
"""Run inference against a model downloaded from the Reflex Cube dashboard.

The dashboard's download button gives you `<job-id>.zip`, containing the model
weights, the tokenizer and a `config.json`. This script unpacks it and runs a
prompt through it.

    python examples/run_downloaded_model.py 3f1c….zip "An absolute triumph."

    # already unpacked
    python examples/run_downloaded_model.py ./my_model "An absolute triumph."

    # force a task instead of inferring it from config.json
    python examples/run_downloaded_model.py model.zip "The future of AI is" \
        --task text-generation

Needs `transformers` and `torch`:

    pip install torch transformers
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import zipfile
from pathlib import Path

#: `config.json` records the head the model was trained with. Mapping it to a
#: pipeline task is more reliable than guessing from the directory contents.
ARCHITECTURE_TASKS = {
    "ForSequenceClassification": "text-classification",
    "ForTokenClassification": "token-classification",
    "ForQuestionAnswering": "question-answering",
    "ForConditionalGeneration": "text2text-generation",
    "ForCausalLM": "text-generation",
    "LMHeadModel": "text-generation",
}


def infer_task(model_dir: Path) -> str:
    """Derive the pipeline task from the saved config."""
    config_path = model_dir / "config.json"
    if not config_path.exists():
        raise SystemExit(f"No config.json in {model_dir} — is this a Reflex Cube export?")

    config = json.loads(config_path.read_text(encoding="utf-8"))
    for architecture in config.get("architectures") or []:
        for suffix, task in ARCHITECTURE_TASKS.items():
            if architecture.endswith(suffix):
                return task

    raise SystemExit(
        f"Could not infer a task from architectures={config.get('architectures')}. "
        "Pass --task explicitly."
    )


def resolve_model_dir(source: Path, stack) -> Path:
    """Return a directory holding the model, unpacking the archive if needed."""
    if source.is_dir():
        return source
    if not source.is_file():
        raise SystemExit(f"{source} does not exist.")
    if source.suffix != ".zip":
        raise SystemExit(f"Expected a directory or a .zip archive, got {source}")

    target = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="reflexcube-")))
    print(f"Unpacking {source} …")
    with zipfile.ZipFile(source) as archive:
        archive.extractall(target)

    # A download may be zipped with or without a top-level directory.
    if not (target / "config.json").exists():
        nested = [p for p in target.iterdir() if p.is_dir()]
        if len(nested) == 1:
            return nested[0]
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("model", type=Path, help="the downloaded .zip, or an unpacked directory")
    parser.add_argument("text", help="input to run through the model")
    parser.add_argument("--task", help="pipeline task (inferred from config.json by default)")
    parser.add_argument(
        "--max-new-tokens", type=int, default=100, help="generation length (default: 100)"
    )
    args = parser.parse_args(argv)

    try:
        from transformers import pipeline
    except ImportError:
        raise SystemExit("transformers is not installed. Try: pip install torch transformers") from None

    import contextlib

    with contextlib.ExitStack() as stack:
        model_dir = resolve_model_dir(args.model, stack)
        task = args.task or infer_task(model_dir)

        print(f"Loading {model_dir} as a '{task}' pipeline …")
        nlp = pipeline(task, model=str(model_dir), tokenizer=str(model_dir))

        print(f"\nInput:  {args.text}")
        if task == "text-generation":
            result = nlp(args.text, max_new_tokens=args.max_new_tokens, num_return_sequences=1)
        else:
            result = nlp(args.text)
        print(f"Output: {json.dumps(result, indent=2, default=str)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
