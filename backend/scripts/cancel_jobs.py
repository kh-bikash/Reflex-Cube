"""Mark every in-flight training job as failed.

    python -m scripts.cancel_jobs
    python -m scripts.cancel_jobs --dry-run

Useful after killing the server while jobs were running: the API reaps these on
startup, but this cancels them without a restart.
"""

from __future__ import annotations

import argparse

from app.db import init_db, session_scope
from app.models import JobStatusValue, TrainingJob

REASON = "Cancelled by an operator."


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="only list what would change")
    args = parser.parse_args(argv)

    init_db()
    with session_scope() as session:
        # Historical rows used a `loading_data_<dataset>` status, so match the
        # prefix rather than only the canonical values.
        active = [
            job
            for job in session.query(TrainingJob).all()
            if job.status in JobStatusValue.ACTIVE or (job.status or "").startswith("loading_data")
        ]

        print(f"Found {len(active)} in-flight job(s).")
        for job in active:
            print(f"  {job.id}  {job.status:<20} {(job.prompt or '')[:60]}")
            if not args.dry_run:
                job.status = JobStatusValue.CANCELLED
                job.error = f"{job.error}\n{REASON}" if job.error else REASON

        if args.dry_run:
            print("Dry run: nothing changed.")
        elif active:
            print("Cancelled.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
