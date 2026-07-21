"""Minimal settings shim for the vendored Stacks harvest pipeline.

The full project's settings.py pulls in pydantic + trading config; the Stacks harvest only needs
three path constants (PROJECT_ROOT / DATA_DIR / CACHE_DIR). `ALLOCATOR_DATA_DIR` redirects the data
tree, so `regenerate.py` points the harvest at a scratch dir and copies only the regenerated JSON
into the committed `src/data/`.
"""

from __future__ import annotations

import os
from pathlib import Path

# harvest/ictbot/settings.py → parents[1] = harvest/
PROJECT_ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = Path(os.environ.get("ALLOCATOR_DATA_DIR") or (PROJECT_ROOT / "data"))
JOURNAL_DIR = DATA_DIR / "journal"
RUNS_DIR = DATA_DIR / "runs"
LOGS_DIR = DATA_DIR / "logs"
CACHE_DIR = DATA_DIR / "cache"
for _d in (JOURNAL_DIR, RUNS_DIR, LOGS_DIR, CACHE_DIR):
    _d.mkdir(parents=True, exist_ok=True)
