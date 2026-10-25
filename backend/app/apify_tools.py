"""Thin wrappers over the Apify actors the research-style cubes use.

The client is built lazily. Importing this module used to raise when
`APIFY_API_TOKEN` was unset, which took down anything that merely imported it
— including the cube registry — on a machine without scraping credentials.
"""

from __future__ import annotations

from typing import Any

from .config import APIFY_API_TOKEN
from .logging_config import get_logger

logger = get_logger(__name__)

_client = None


class ApifyNotConfigured(RuntimeError):
    """Raised when an Apify call is made without a usable client."""


def is_configured() -> bool:
    """True if a token is present, without building the client."""
    return bool(APIFY_API_TOKEN)


def get_client():
    """Return a cached `ApifyClient`.

    Raises:
        ApifyNotConfigured: if the token is missing or the SDK is not installed.
    """
    global _client
    if _client is not None:
        return _client

    if not APIFY_API_TOKEN:
        raise ApifyNotConfigured("APIFY_API_TOKEN is not set; web scraping tools are unavailable.")
    try:
        from apify_client import ApifyClient
    except ImportError as exc:  # pragma: no cover - requires the extra
        raise ApifyNotConfigured("The apify-client package is not installed.") from exc

    _client = ApifyClient(APIFY_API_TOKEN)
    return _client


def _collect(run: dict[str, Any]) -> list[dict[str, Any]]:
    """Drain an actor run's default dataset."""
    client = get_client()
    return list(client.dataset(run["defaultDatasetId"]).iterate_items())


def scrape_webpage(url: str) -> list[dict[str, Any]]:
    """Return the title and visible text of a page."""
    run = (
        get_client()
        .actor("apify/web-scraper")
        .call(
            run_input={
                "startUrls": [{"url": url}],
                "useChrome": False,
                "pageFunction": (
                    "async () => ({ title: document.title, text: document.body.innerText })"
                ),
            }
        )
    )
    return _collect(run)


def search_google(query: str, max_items: int = 5) -> list[dict[str, Any]]:
    """Return the top organic results for a query."""
    run = (
        get_client()
        .actor("apify/google-search-scraper")
        .call(run_input={"queries": query, "resultsPerPage": max_items})
    )
    return _collect(run)


def scrape_instagram_profile(username: str, max_items: int = 10) -> list[dict[str, Any]]:
    """Return a public Instagram profile and its recent posts."""
    run = (
        get_client()
        .actor("apify/instagram-profile-scraper")
        .call(run_input={"username": [username], "resultsLimit": max_items})
    )
    return _collect(run)
