"""ReflexBrain: the agentic fallback behind cubes that take a free-text prompt.

The loop is: the model reasons about the request and may emit Python; that code
runs in an E2B sandbox with the scraping/search credentials injected; the model
then writes the report from the sandbox output.

Loading is lazy. The previous version built the model at import time, so simply
importing `app.api` downloaded several gigabytes of weights before the server
could answer anything — and a failure left a half-initialised singleton whose
every method returned `"Error: Model not loaded."`. Now nothing is loaded until
the first agent call (or startup, if `BRAIN_EAGER_LOAD=1`), and the brain
reports *why* it is unavailable rather than pretending to work.
"""

from __future__ import annotations

import json
import re
import threading
from typing import Any

from .config import (
    APIFY_API_TOKEN,
    BRAIN_MODEL_ID,
    E2B_API_KEY,
    EMBEDDING_MODEL_ID,
    HF_TOKEN,
    SERPAPI_API_KEY,
)
from .logging_config import get_logger
from .utils import cube_dir

logger = get_logger(__name__)

_CODE_BLOCK_RE = re.compile(r"```python\s*\n(.*?)```", re.DOTALL)

#: turbovec marks an empty slot with the maximum uint64.
_EMPTY_SLOT = 18_446_744_073_709_551_615


class BrainUnavailable(RuntimeError):
    """Raised when the agent is asked to run without a loaded model."""


class ReflexBrain:
    """Quantized causal LM plus a vector memory and a code sandbox."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self._load_error: str | None = None

        self.model = None
        self.tokenizer = None
        self.device = "cpu"

        self.embedder = None
        self.memory_index = None
        self.memory_db: list[str] = []

        self._memory_dir = cube_dir("nexus")
        self._memory_index_path = self._memory_dir / "nexus_memory.tvim"
        self._memory_db_path = self._memory_dir / "nexus_db.json"

    # -- Lifecycle ---------------------------------------------------------

    @property
    def is_ready(self) -> bool:
        return self._loaded and self.model is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def status(self) -> dict[str, Any]:
        """Describe the brain without triggering a load."""
        return {
            "loaded": self._loaded,
            "ready": self.is_ready,
            "model_id": BRAIN_MODEL_ID,
            "device": self.device,
            "memories": len(self.memory_db),
            "sandbox_configured": bool(E2B_API_KEY),
            "error": self._load_error,
        }

    def ensure_loaded(self) -> bool:
        """Load the model and memory on first use. Returns True if ready.

        A failed load is remembered, so a missing dependency costs one attempt
        rather than a multi-minute retry on every request.
        """
        if self._loaded:
            return self.is_ready

        with self._lock:
            if self._loaded:
                return self.is_ready
            try:
                self._load()
            except Exception as exc:
                self._load_error = f"{type(exc).__name__}: {exc}"
                logger.warning("ReflexBrain unavailable: %s", self._load_error)
            finally:
                self._loaded = True
        return self.is_ready

    def _load(self) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("Loading ReflexBrain %s on %s…", BRAIN_MODEL_ID, self.device)

        model_kwargs: dict[str, Any] = {"token": HF_TOKEN}
        if self.device == "cuda":
            # 4-bit quantization needs bitsandbytes and a CUDA device; on CPU it
            # raises, so only ask for it where it can work.
            try:
                from transformers import BitsAndBytesConfig

                model_kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16
                )
                model_kwargs["device_map"] = "auto"
            except ImportError:
                logger.info("bitsandbytes not installed; loading in fp16 instead.")
                model_kwargs["torch_dtype"] = torch.float16
                model_kwargs["device_map"] = "auto"

        self.tokenizer = AutoTokenizer.from_pretrained(BRAIN_MODEL_ID, token=HF_TOKEN)
        self.model = AutoModelForCausalLM.from_pretrained(BRAIN_MODEL_ID, **model_kwargs)
        if self.device == "cpu":
            self.model.to(self.device)

        self._load_memory()
        logger.info("ReflexBrain ready (%d memories).", len(self.memory_db))

    def _load_memory(self) -> None:
        """Load the embedding model and vector index; optional."""
        try:
            import numpy as np  # noqa: F401  (required by turbovec calls)
            from sentence_transformers import SentenceTransformer
            from turbovec import IdMapIndex
        except ImportError as exc:
            logger.info("Memory engine disabled (%s).", exc)
            return

        self.embedder = SentenceTransformer(EMBEDDING_MODEL_ID)
        if self._memory_index_path.exists():
            self.memory_index = IdMapIndex.load(str(self._memory_index_path))
        else:
            # 384 is the all-MiniLM-L6-v2 dimension; bit_width=4 trades a little
            # recall for a ~8x smaller index.
            self.memory_index = IdMapIndex(dim=384, bit_width=4)

        if self._memory_db_path.exists():
            try:
                self.memory_db = json.loads(self._memory_db_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Could not read memory store: %s", exc)
                self.memory_db = []

    # -- Generation --------------------------------------------------------

    def generate(self, prompt: str, max_new_tokens: int = 512) -> str:
        """Single-turn generation. Raises `BrainUnavailable` if not loaded."""
        if not self.ensure_loaded():
            raise BrainUnavailable(self._load_error or "Brain model is not loaded.")

        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        outputs = self.model.generate(**inputs, max_new_tokens=max_new_tokens)
        text = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        # The decode includes the prompt; return only the continuation.
        return text[len(prompt) :].strip() if text.startswith(prompt) else text

    def run_agent(self, user_request: Any, cube_type: str) -> str:
        """Reason, optionally execute code in a sandbox, then synthesise a report.

        Args:
            user_request: The prompt. Dicts are flattened to their `text`/
                `query`/`prompt` field so console payloads work unchanged.
            cube_type: Cube id, used to frame the system prompt.

        Returns:
            Markdown.

        Raises:
            BrainUnavailable: if the model could not be loaded.
        """
        request_text = _coerce_request(user_request)
        reasoning_prompt = _build_prompt(cube_type, request_text)

        response = self.generate(reasoning_prompt)
        code_blocks = _CODE_BLOCK_RE.findall(response)
        if not code_blocks:
            return response

        results = self._run_sandbox(code_blocks)
        synthesis_prompt = (
            f"{reasoning_prompt}\n\nSandbox Execution Results:\n"
            f"{json.dumps(results, indent=2, default=str)}\n\n"
            "Based on these results, write a comprehensive, well-formatted "
            "Markdown report for the user."
        )
        return self.generate(synthesis_prompt)

    def _run_sandbox(self, code_blocks: list[str]) -> list[dict[str, Any]]:
        """Execute model-written code in an isolated E2B sandbox."""
        if not E2B_API_KEY:
            return [{"error": "E2B_API_KEY is not configured; code execution skipped."}]

        try:
            from e2b_code_interpreter import Sandbox
        except ImportError:
            return [{"error": "e2b_code_interpreter is not installed."}]

        logger.info("Executing %d code block(s) in the E2B sandbox.", len(code_blocks))

        # Credentials are passed as sandbox environment variables rather than
        # interpolated into the source, so a key cannot end up in a traceback,
        # in the model's next prompt, or in the report.
        env_vars = {
            key: value
            for key, value in (
                ("SERPAPI_API_KEY", SERPAPI_API_KEY),
                ("APIFY_API_TOKEN", APIFY_API_TOKEN),
            )
            if value
        }

        results: list[dict[str, Any]] = []
        with Sandbox(api_key=E2B_API_KEY, envs=env_vars) as sandbox:
            for code in code_blocks:
                execution = sandbox.run_code(code, envs=env_vars)
                results.append(
                    {
                        "stdout": execution.logs.stdout,
                        "stderr": execution.logs.stderr,
                        "error": execution.error.name if execution.error else None,
                    }
                )
        return results

    # -- Memory ------------------------------------------------------------

    def remember(self, text: str) -> bool:
        """Embed and persist `text`. Returns False if memory is unavailable."""
        if not self.ensure_loaded() or self.embedder is None or self.memory_index is None:
            return False

        import numpy as np

        vector = self.embedder.encode(text)
        new_id = len(self.memory_db)

        self.memory_db.append(text)
        self._memory_db_path.write_text(json.dumps(self.memory_db), encoding="utf-8")

        self.memory_index.add_with_ids(np.array([vector]), np.array([new_id], dtype=np.uint64))
        self.memory_index.write(str(self._memory_index_path))
        return True

    def recall(self, query: str, k: int = 3) -> list[str]:
        """Return up to `k` memories most similar to `query`."""
        if (
            not self.ensure_loaded()
            or self.embedder is None
            or self.memory_index is None
            or not self.memory_db
        ):
            return []

        import numpy as np

        query_vector = self.embedder.encode(query)
        _scores, ids = self.memory_index.search(np.array([query_vector]), k=k)

        results = []
        for doc_id in ids[0]:
            if doc_id == _EMPTY_SLOT:
                continue
            index = int(doc_id)
            if 0 <= index < len(self.memory_db):
                results.append(self.memory_db[index])
        return results


def _coerce_request(user_request: Any) -> str:
    """Flatten a console payload into the prompt string."""
    if isinstance(user_request, str):
        return user_request
    if isinstance(user_request, dict):
        for key in ("text", "query", "prompt", "input", "message"):
            value = user_request.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return json.dumps(user_request, default=str)
    return str(user_request)


def _build_prompt(cube_type: str, user_request: str) -> str:
    return f"""You are the intelligent agent for the '{cube_type}' cube.
Answer the user's request. You have a secure Python execution environment.

For live web research, write Python that calls SerpApi with the `requests`
library. The key is in os.environ['SERPAPI_API_KEY'].
For scraping pages or social media, use the Apify API with the token in
os.environ['APIFY_API_TOKEN'].

Put code in ```python blocks and print() anything you need to see.

User Request: {user_request}

Thought process and code to execute (if any):"""


_brain: ReflexBrain | None = None
_brain_lock = threading.Lock()


def get_brain() -> ReflexBrain:
    """Return the process-wide brain, constructing (but not loading) it once."""
    global _brain
    if _brain is None:
        with _brain_lock:
            if _brain is None:
                _brain = ReflexBrain()
    return _brain


__all__ = ["BrainUnavailable", "ReflexBrain", "get_brain"]
