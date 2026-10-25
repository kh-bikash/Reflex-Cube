"""Resolves a natural-language prompt into a base model and a real dataset.

Searching the Hugging Face Hub gives topical relevance; the curated fallbacks
give reliability when a search returns nothing loadable. Both layers only ever
name real Hub artefacts — nothing here fabricates training data.
"""

from __future__ import annotations

from .config import HF_TOKEN
from .logging_config import get_logger

logger = get_logger(__name__)

#: Words that carry no signal for a dataset search.
STOPWORDS = frozenset(
    [
        "a",
        "an",
        "the",
        "in",
        "on",
        "at",
        "for",
        "to",
        "of",
        "with",
        "and",
        "or",
        "build",
        "create",
        "train",
        "make",
        "model",
        "ai",
        "using",
        "dataset",
        "data",
        "about",
        "that",
        "this",
        "my",
        "me",
        "please",
        "can",
        "you",
        "help",
        "need",
        "want",
    ]
)

#: Internal task name -> the Hub's `task_categories` filter value.
HF_TASK_FILTER = {
    "text-generation": "text-generation",
    "summarization": "summarization",
    "translation": "translation",
    "text-classification": "text-classification",
    "token-classification": "token-classification",
    "question-answering": "question-answering",
}

#: Domain keyword -> a dataset known to load and to suit that domain.
DOMAIN_DATASETS = (
    (("bank", "finance", "money", "transaction"), "banking77"),
    (("spam", "junk", "phishing"), "SetFit/enron_spam"),
    (("emotion", "feeling", "mood"), "dair-ai/emotion"),
    (("legal", "law", "contract", "court"), "lex_glue,ecthr_a"),
    (("sentiment", "review", "movie", "opinion"), "imdb"),
    (("news", "headline", "article"), "ag_news"),
    (("toxic", "hate", "abuse"), "SetFit/toxic_conversations"),
)

#: Last-resort dataset per task. Every entry is a small, reliably loadable corpus.
DEFAULT_DATASETS = {
    "text-classification": "ag_news",
    "summarization": "cnn_dailymail,3.0.0",
    "text-generation": "wikitext,wikitext-2-raw-v1",
    "translation": "opus_books,en-fr",
    "token-classification": "conll2003",
    "question-answering": "squad",
}

#: Base model per task, chosen to fine-tune in minutes on CPU.
DEFAULT_MODELS = {
    "text-classification": "distilbert-base-uncased",
    "summarization": "t5-small",
    "text-generation": "distilgpt2",
    "translation": "t5-small",
    "token-classification": "distilbert-base-cased",
    "question-answering": "distilbert-base-cased-distilled-squad",
}

#: Architectures a prompt may name explicitly, longest key first so that
#: "distilbert" is not shadowed by "bert".
MODEL_KEYWORDS = (
    ("distilbert", "distilbert-base-uncased"),
    ("distilgpt2", "distilgpt2"),
    ("roberta", "roberta-base"),
    ("albert", "albert-base-v2"),
    ("bart", "facebook/bart-base"),
    ("bert", "bert-base-uncased"),
    ("gpt2", "gpt2"),
    ("t5", "t5-small"),
)


class PromptInterpreter:
    """Turns a prompt plus a task into `{task, model_name, dataset_name}`."""

    def __init__(self) -> None:
        self._api = None

    @property
    def api(self):
        """Lazily built `HfApi`; None when huggingface_hub is unavailable."""
        if self._api is None:
            try:
                from huggingface_hub import HfApi

                self._api = HfApi(token=HF_TOKEN)
            except ImportError:
                logger.info("huggingface_hub not installed; using curated datasets only.")
                self._api = False
        return self._api or None

    # -- Public API --------------------------------------------------------

    def parse_and_resolve(self, prompt: str, detected_task: str) -> dict[str, str]:
        """Resolve a prompt and task into a concrete model and dataset."""
        logger.info("Analysing prompt %r for task %r", prompt[:80], detected_task)
        query = self.build_query(prompt)
        return {
            "task": detected_task,
            "dataset_name": self.search_dataset(query, detected_task, prompt),
            "model_name": self.resolve_model(detected_task, prompt),
        }

    @staticmethod
    def build_query(prompt: str) -> str:
        """Reduce a prompt to the few content words worth searching on."""
        words = [
            word
            for word in (w.strip(".,!?;:\"'()").lower() for w in prompt.split())
            if word.isalnum() and word not in STOPWORDS and len(word) > 2
        ]
        # Keep order but drop repeats, then take the three most specific words.
        unique = list(dict.fromkeys(words))
        return " ".join(unique[:3])

    def search_dataset(self, query: str, task: str, prompt: str = "") -> str:
        """Find a Hub dataset for `query`, falling back when none is suitable."""
        if not query.strip() or self.api is None:
            return self.get_fallback_dataset(task, prompt)

        try:
            logger.info("Searching the Hub for datasets matching %r…", query)
            results = list(
                self.api.list_datasets(
                    search=query,
                    filter=HF_TASK_FILTER.get(task, "text-classification"),
                    limit=5,
                    sort="downloads",
                )
            )
        except Exception as exc:
            logger.warning("Hub search failed (%s); using a curated dataset.", exc)
            return self.get_fallback_dataset(task, prompt)

        if not results:
            logger.info("No Hub match for %r; using a curated dataset.", query)
            return self.get_fallback_dataset(task, prompt)

        chosen = results[0].id
        logger.info("Selected dataset %r", chosen)
        return chosen

    @staticmethod
    def get_fallback_dataset(task: str, prompt: str = "") -> str:
        """Curated dataset for the prompt's domain, else the task default."""
        lowered = prompt.lower()
        for keywords, dataset in DOMAIN_DATASETS:
            if any(keyword in lowered for keyword in keywords):
                return dataset
        return DEFAULT_DATASETS.get(task, "ag_news")

    @staticmethod
    def resolve_model(task: str, prompt: str = "") -> str:
        """Honour an architecture named in the prompt, else the task default."""
        lowered = prompt.lower()
        for keyword, model in MODEL_KEYWORDS:
            if keyword in lowered:
                return model
        return DEFAULT_MODELS.get(task, "distilbert-base-uncased")


#: Shared instance used by the trainer.
interpreter = PromptInterpreter()
