"""Prompt -> task/model/dataset resolution."""

from __future__ import annotations

import pytest

from app.interpreter import DEFAULT_DATASETS, DEFAULT_MODELS, PromptInterpreter
from app.trainer import detect_task


@pytest.mark.parametrize(
    ("prompt", "expected"),
    [
        ("summarize long news articles", "summarization"),
        ("translate english to french", "translation"),
        ("build a sentiment analysis model for movie reviews", "text-classification"),
        ("classify support tickets by topic", "text-classification"),
        ("detect spam emails", "text-classification"),
        ("extract named entity spans from text", "token-classification"),
        ("answer questions about a document", "question-answering"),
        ("write short stories in the style of poe", "text-generation"),
    ],
)
def test_detect_task_from_prompt(prompt, expected):
    assert detect_task(prompt) == expected


def test_explicit_task_overrides_the_heuristic():
    assert detect_task("summarize everything", "text-generation") == "text-generation"


def test_auto_falls_back_to_the_heuristic():
    assert detect_task("summarize everything", "auto") == "summarization"


def test_aliases_are_normalised():
    assert detect_task("x", "sentiment-analysis") == "text-classification"
    assert detect_task("x", "ner") == "token-classification"


def test_unknown_prompt_defaults_to_classification():
    assert detect_task("hello there") == "text-classification"


class TestQueryBuilding:
    def test_drops_stopwords_and_short_words(self):
        query = PromptInterpreter.build_query("Build a model to classify spam emails")
        assert "build" not in query
        assert "spam" in query

    def test_keeps_at_most_three_terms(self):
        query = PromptInterpreter.build_query(
            "classify legal medical financial sporting culinary documents"
        )
        assert len(query.split()) <= 3

    def test_deduplicates(self):
        assert PromptInterpreter.build_query("spam spam spam filter") == "spam filter"

    def test_empty_prompt_yields_empty_query(self):
        assert PromptInterpreter.build_query("build a model") == ""


class TestFallbackDataset:
    @pytest.mark.parametrize(
        ("prompt", "expected"),
        [
            ("detect spam in email", "SetFit/enron_spam"),
            ("analyse bank transactions", "banking77"),
            ("rate movie reviews", "imdb"),
            ("categorise news headlines", "ag_news"),
        ],
    )
    def test_domain_keywords_pick_a_matching_corpus(self, prompt, expected):
        assert PromptInterpreter.get_fallback_dataset("text-classification", prompt) == expected

    def test_falls_back_to_the_task_default(self):
        assert (
            PromptInterpreter.get_fallback_dataset("summarization", "")
            == DEFAULT_DATASETS["summarization"]
        )

    def test_unknown_task_still_returns_something_loadable(self):
        assert PromptInterpreter.get_fallback_dataset("not-a-task", "") == "ag_news"


class TestModelResolution:
    @pytest.mark.parametrize(
        ("prompt", "expected"),
        [
            ("use roberta please", "roberta-base"),
            ("fine-tune distilbert", "distilbert-base-uncased"),
            ("train a gpt2 model", "gpt2"),
            ("use t5 for this", "t5-small"),
        ],
    )
    def test_prompt_can_name_an_architecture(self, prompt, expected):
        assert PromptInterpreter.resolve_model("text-classification", prompt) == expected

    def test_distilbert_is_not_shadowed_by_bert(self):
        """`bert` is a substring of `distilbert`; longest match must win."""
        assert (
            PromptInterpreter.resolve_model("text-classification", "use distilbert")
            == "distilbert-base-uncased"
        )

    @pytest.mark.parametrize("task", sorted(DEFAULT_MODELS))
    def test_every_task_has_a_default_model(self, task):
        assert PromptInterpreter.resolve_model(task, "") == DEFAULT_MODELS[task]


def test_resolution_is_offline_safe(monkeypatch):
    """With no Hub client, resolution still returns a usable pair."""
    interpreter = PromptInterpreter()
    monkeypatch.setattr(type(interpreter), "api", property(lambda self: None))
    result = interpreter.parse_and_resolve("classify spam", "text-classification")
    assert result["dataset_name"] == "SetFit/enron_spam"
    assert result["model_name"] == "distilbert-base-uncased"
    assert result["task"] == "text-classification"


def test_hub_failure_falls_back(monkeypatch):
    class Boom:
        def list_datasets(self, **kwargs):
            raise RuntimeError("hub down")

    interpreter = PromptInterpreter()
    monkeypatch.setattr(type(interpreter), "api", property(lambda self: Boom()))
    assert interpreter.search_dataset("spam", "text-classification", "spam") == (
        "SetFit/enron_spam"
    )


def test_hub_hit_is_preferred(monkeypatch):
    class Hit:
        id = "someone/custom-dataset"

    class Api:
        def list_datasets(self, **kwargs):
            return [Hit()]

    interpreter = PromptInterpreter()
    monkeypatch.setattr(type(interpreter), "api", property(lambda self: Api()))
    assert (
        interpreter.search_dataset("spam", "text-classification", "spam")
        == "someone/custom-dataset"
    )
