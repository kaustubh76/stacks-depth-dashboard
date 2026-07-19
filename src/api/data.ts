// Data loader. The committed 2026-07-18 snapshot is baked in at build time, so the
// dashboard renders fully static with zero backend. If a live /api/stacks/dashboard
// answers (i.e. the FastAPI app is serving this bundle same-origin), its payload
// overrides the baked one — exactly the graceful-degradation pattern from the
// original static page. On a plain static host the fetch simply no-ops.

import summary from "../data/summary.json";
import study from "../data/study.json";
import facts from "../data/facts.json";
import ladders from "../data/depth_ladders.json";
import type { Dashboard, DepthLadder, StacksData, Summary, Study, Facts } from "./types";

const BAKED: StacksData = {
  summary: summary as unknown as Summary,
  study: study as unknown as Study,
  facts: facts as unknown as Facts,
  ladders: ladders as unknown as DepthLadder[],
  live: false,
};

/** The baked snapshot — always available, synchronous, never blanks. */
export function bakedData(): StacksData {
  return BAKED;
}

/** Try a live backend; resolve to its payload (marked live) or null if none answers. */
export async function fetchLive(signal?: AbortSignal): Promise<StacksData | null> {
  try {
    const r = await fetch("/api/stacks/dashboard", { headers: { accept: "application/json" }, signal });
    if (!r.ok) return null;
    const d = (await r.json()) as Partial<Dashboard>;
    if (!d || !d.summary || !d.study) return null;
    return {
      summary: d.summary as Summary,
      study: d.study as Study,
      facts: (d.facts as Facts) ?? BAKED.facts,
      ladders: BAKED.ladders, // per-pool ladders are only in the baked derivation
      live: true,
    };
  } catch {
    return null; // static host / offline / CORS — baked data stands
  }
}
