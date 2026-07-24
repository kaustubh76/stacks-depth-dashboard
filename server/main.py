"""
Stacks Depth — live read-only API.

Serves the committed on-chain depth snapshot (../src/data/*.json, refreshed every 6h by the
re-harvest cron) as a real JSON API, so the dashboard is a live client of a running service
instead of a baked static file. No network, no harvest in the request path, no custody — it only
reads the committed dataset the frontend already trusts.

    uvicorn server.main:app --host 0.0.0.0 --port $PORT
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# The committed dataset lives in the frontend's src/data (the same files the SPA bakes).
DATA_DIR = Path(__file__).resolve().parent.parent / "src" / "data"


def _read(name: str):
    path = DATA_DIR / name
    if not path.exists():
        raise HTTPException(status_code=503, detail=f"{name} not present — dataset not built")
    return json.loads(path.read_text())


def _read_optional(name: str, default):
    """Like _read but returns `default` instead of 503 — for optional files (history)."""
    try:
        return _read(name)
    except HTTPException:
        return default


app = FastAPI(
    title="Stacks Depth API",
    description="Live read-only market-structure instrument for Stacks DeFi — no custody, read-only.",
    version="1.0.0",
)

# Public, read-only data — the dashboard is served from a different origin (the Render static site).
_origins = os.environ.get("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _origins == "*" else [o.strip() for o in _origins.split(",") if o.strip()],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
@app.get("/health")
def health():
    try:
        summary = _read("summary.json")
        return {"ok": True, "service": "stacks-depth-api", "as_of": summary.get("as_of_date")}
    except Exception:
        return {"ok": False}


@app.get("/api/stacks/summary")
def summary():
    return _read("summary.json")


@app.get("/api/stacks/study")
def study():
    return _read("study.json")


@app.get("/api/stacks/facts")
def facts():
    return _read("facts.json")


@app.get("/api/stacks/depth")
def depth():
    """The per-pool slippage ladders (records) — lets the frontend take its curves live too."""
    return _read("depth_ladders.json")


@app.get("/api/stacks/history")
def history():
    """The finding over time — one point per harvest date (movable / TVL / volume / tradeable)."""
    return _read_optional("history.json", [])


@app.get("/api/stacks/dashboard")
def dashboard():
    """Everything the page needs in one round-trip (what the frontend's fetchLive fetches)."""
    return {
        "summary": _read("summary.json"),
        "study": _read("study.json"),
        "facts": _read("facts.json"),
        "history": _read_optional("history.json", []),
    }
