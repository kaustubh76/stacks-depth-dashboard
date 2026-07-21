"""
Live Stacks Depth web layer — serves the committed dataset over a small JSON API and serves the
dashboard that consumes it. Self-contained: it reads only ``data/stacks/*`` through the existing
``store`` / ``facts`` loaders (no network, no broker), so it lifts out with the package as a
standalone server::

    uvicorn ictbot.stacks.webapp:app     # or: make stacks_serve

  GET /stacks                 -> the dashboard HTML (web-stacks/index.html), live
  GET /api/stacks/summary     -> data/stacks/summary.json
  GET /api/stacks/study       -> data/stacks/study.json   (verdict + depth index)
  GET /api/stacks/facts       -> data/stacks/facts.json
  GET /api/stacks/depth       -> the per-pool slippage ladders (records)
  GET /api/stacks/dashboard   -> { summary, study, facts } in one round-trip (what the page fetches)

It is also mounted into the main mission-control app as a guarded convenience (see
``ictbot.api.app``), so one ``make api`` process serves both — the import is one-way (that app
depends on this module, never the reverse), keeping the Stacks package independently extractable.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse

from ictbot.settings import PROJECT_ROOT
from ictbot.stacks import facts, store

DASHBOARD = PROJECT_ROOT / "web-stacks" / "index.html"

stacks_router = APIRouter(prefix="/api/stacks", tags=["stacks"])


def _summary() -> dict:
    return store.read_summary() or {}


def _study() -> dict:
    return store.read_study() or {}


def _facts() -> dict:
    return facts._read_committed() or {}


@stacks_router.get("/summary")
def summary() -> dict:
    return _summary()


@stacks_router.get("/study")
def study() -> dict:
    return _study()


@stacks_router.get("/facts")
def facts_route() -> dict:
    return _facts()


@stacks_router.get("/depth")
def depth() -> list[dict]:
    df = store.read_depth_df()
    if df is None or df.empty:
        return []
    # to_json handles NaN->null + numpy types cleanly; parse back to plain records for FastAPI.
    return json.loads(df.to_json(orient="records"))


@stacks_router.get("/dashboard")
def dashboard_data() -> dict:
    """Everything the page needs in one fetch. 503 (not empty) when the dataset isn't built yet."""
    s, st = _summary(), _study()
    if not s or not st:
        raise HTTPException(503, "no committed Stacks dataset — run `make stacks_study` first")
    return {"summary": s, "study": st, "facts": _facts()}


def _serve_dashboard() -> FileResponse:
    if not DASHBOARD.exists():
        raise HTTPException(503, "dashboard not generated — run `make stacks_dashboard`")
    return FileResponse(str(DASHBOARD), media_type="text/html")


def register_dashboard(app: FastAPI) -> None:
    """Add ``GET /stacks`` -> the dashboard HTML. Safe on the main app: it's an explicit route, so it
    registers before that app's catch-all SPA StaticFiles mount and wins."""
    app.add_api_route("/stacks", _serve_dashboard, methods=["GET"], include_in_schema=False)


def _build_app() -> FastAPI:
    a = FastAPI(
        title="Stacks Depth",
        description="Live market-structure instrument for Stacks DeFi — no custody, read-only.",
    )
    a.include_router(stacks_router)
    register_dashboard(a)

    @a.get("/", include_in_schema=False)
    def root() -> FileResponse:  # standalone convenience: / -> the dashboard
        return _serve_dashboard()

    return a


app = _build_app()
