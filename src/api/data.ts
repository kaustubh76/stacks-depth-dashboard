// Data loader. The committed on-chain snapshot is baked in at build time, so the
// dashboard renders fully static with zero backend. If a live /api/stacks/dashboard
// answers (i.e. the FastAPI app is serving this bundle same-origin), its payload
// overrides the baked one — exactly the graceful-degradation pattern from the
// original static page. On a plain static host the fetch simply no-ops.

import summary from "../data/summary.json";
import study from "../data/study.json";
import facts from "../data/facts.json";
import ladders from "../data/depth_ladders.json";
import history from "../data/history.json";
import type { Dashboard, DepthLadder, HistoryPoint, StacksData, Summary, Study, Facts } from "./types";

const BAKED: StacksData = {
  summary: summary as unknown as Summary,
  study: study as unknown as Study,
  facts: facts as unknown as Facts,
  ladders: ladders as unknown as DepthLadder[],
  history: history as unknown as HistoryPoint[],
  live: false,
};

/** The baked snapshot — always available, synchronous, never blanks. */
export function bakedData(): StacksData {
  return BAKED;
}

/** The live API base. A real backend (server/main.py, deployed as a Render web service) serves the
 * committed snapshot at ${API_BASE}/api/stacks/*, so the dashboard is a live CLIENT of a running
 * service rather than a baked static file. Overridable at build time via VITE_API_BASE. */
const API_BASE = (import.meta.env.VITE_API_BASE || "https://stacks-depth-api.onrender.com").replace(/\/$/, "");

/** Fetch the current dataset from the live API; resolve to its payload (marked live) or null if the
 * API doesn't answer — in which case the baked snapshot stands, so the site never blanks. Also takes
 * the per-pool ladders live from /api/stacks/depth when available (so the curves are live too). */
export async function fetchLive(signal?: AbortSignal): Promise<StacksData | null> {
  try {
    const [dashRes, depthRes] = await Promise.all([
      fetch(`${API_BASE}/api/stacks/dashboard`, { headers: { accept: "application/json" }, signal }),
      fetch(`${API_BASE}/api/stacks/depth`, { headers: { accept: "application/json" }, signal }).catch(() => null),
    ]);
    if (!dashRes.ok) return null;
    const d = (await dashRes.json()) as Partial<Dashboard>;
    if (!d || !d.summary || !d.study) return null;
    let ladders = BAKED.ladders; // per-pool ladders fall back to the baked derivation
    if (depthRes && depthRes.ok) {
      const dl = (await depthRes.json()) as DepthLadder[];
      if (Array.isArray(dl) && dl.length > 0) ladders = dl;
    }
    return {
      summary: d.summary as Summary,
      study: d.study as Study,
      facts: (d.facts as Facts) ?? BAKED.facts,
      ladders,
      history: (d.history as HistoryPoint[] | undefined) ?? BAKED.history,
      live: true,
    };
  } catch {
    return null; // offline / CORS / API down — baked data stands
  }
}
