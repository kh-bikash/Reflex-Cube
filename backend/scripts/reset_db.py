"""Drop and recreate the database schema.

    python -m scripts.reset_db            # prompt before dropping
    python -m scripts.reset_db --yes      # no prompt
    python -m scripts.reset_db --delete-file   # also remove the SQLite file

Destructive: every training job record is lost. Model artefacts under
STORAGE_PATH are left alone.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.config import DATABASE_URL
from app.db import Base, engine, init_db


def _sqlite_path() -> Path | None:
    if not DATABASE_URL.startswith("sqlite"):
        return None
    return Path(DATABASE_URL.split("sqlite:///", 1)[-1].lstrip("/")).resolve()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    parser.add_argument(
        "--delete-file",
        action="store_true",
        help="remove the SQLite file instead of dropping tables",
    )
    args = parser.parse_args(argv)

    print(f"Database: {DATABASE_URL}")
    if not args.yes:
        reply = input("This deletes every job record. Continue? [y/N] ").strip().lower()
        if reply not in {"y", "yes"}:
            print("Aborted.")
            return 1

    if args.delete_file:
        path = _sqlite_path()
        if path is None:
            print("--delete-file only applies to SQLite databases.", file=sys.stderr)
            return 2
        engine.dispose()
        if path.exists():
            path.unlink()
            print(f"Deleted {path}")
    else:
        Base.metadata.drop_all(bind=engine)
        print("Dropped all tables.")

    init_db()
    print("Schema recreated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
