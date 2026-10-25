"""Logging setup shared by the API server and the training worker.

The codebase used to call a hand-rolled `safe_print` that swallowed every
exception, which hid encoding errors on Windows consoles and made log levels
impossible. Standard logging gives the same crash-safety (a failing handler
never propagates) plus levels, timestamps and a single place to reconfigure.
"""

from __future__ import annotations

import contextlib
import logging
import sys

from .config import LOG_LEVEL

_CONFIGURED = False

_FORMAT = "%(asctime)s %(levelname)-7s [%(name)s] %(message)s"
_DATEFMT = "%H:%M:%S"


def configure_logging(level: str | int | None = None) -> None:
    """Install a stdout handler once. Safe to call from any entry point."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    # Cube and trainer logs contain emoji and dataset text; a cp1252 console
    # would raise UnicodeEncodeError mid-run without this.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            with contextlib.suppress(ValueError, OSError):
                reconfigure(encoding="utf-8", errors="replace")

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATEFMT))

    root = logging.getLogger()
    root.setLevel(level or LOG_LEVEL)
    root.addHandler(handler)

    # These libraries log a progress line per shard at INFO.
    for noisy in ("urllib3", "filelock", "huggingface_hub", "datasets"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a configured logger. `name` is usually `__name__`."""
    configure_logging()
    return logging.getLogger(name)
