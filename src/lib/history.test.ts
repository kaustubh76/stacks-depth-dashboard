import { describe, it, expect } from "vitest";

import historyJson from "../data/history.json";
import summaryJson from "../data/summary.json";
import studyJson from "../data/study.json";
import type { HistoryPoint, Summary, Study } from "../api/types";

// The depth-over-time series is real data: git-backfilled from past harvests and extended by every
// 6h re-harvest (harvest/regenerate.py::append_history). These assertions run in CI and in the
// re-harvest gate, so a harvest that forgets to append — or writes an out-of-order / malformed point
// — fails BEFORE it ships. Nothing here is hardcoded; the "current snapshot" is read from the same
// committed JSON the SPA bakes, so the invariant survives every refresh.
const history = historyJson as unknown as HistoryPoint[];
const summary = summaryJson as unknown as Summary;
const study = studyJson as unknown as Study;

const NUMERIC_FIELDS: (keyof HistoryPoint)[] = [
  "as_of_ts",
  "movable_at_2pct_usd",
  "deepest_single_pool_usd",
  "n_tradeable_assets",
  "tvl_usd_total",
  "volume_24h_usd_clean",
  "pools_live",
  "pools_total",
];

describe("history.json is a well-formed real time-series", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  it("has a strictly increasing, unique as_of_date (one point per harvest date, sorted)", () => {
    const dates = history.map((p) => p.as_of_date);
    expect(new Set(dates).size).toBe(dates.length); // unique
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted); // ascending
  });

  it("every point carries finite numeric fields and a boolean verdict", () => {
    for (const p of history) {
      expect(typeof p.as_of_date).toBe("string");
      expect(p.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof p.rotation_viable).toBe("boolean");
      for (const f of NUMERIC_FIELDS) {
        expect(Number.isFinite(p[f] as number)).toBe(true);
      }
      // sanity: a harvest always sees at least some pools, and never more live than total
      expect(p.pools_live).toBeGreaterThan(0);
      expect(p.pools_live).toBeLessThanOrEqual(p.pools_total);
      expect(p.n_tradeable_assets).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the last history point matches the current committed snapshot (append contract)", () => {
  const last = history[history.length - 1];

  it("last.as_of_date === summary.as_of_date", () => {
    expect(last.as_of_date).toBe(summary.as_of_date);
  });

  it("last mirrors study.verdict (movable / tradeable / rotation)", () => {
    expect(last.movable_at_2pct_usd).toBe(study.verdict.movable_at_2pct_usd);
    expect(last.deepest_single_pool_usd).toBe(study.verdict.deepest_single_pool_usd);
    expect(last.n_tradeable_assets).toBe(study.verdict.n_tradeable_assets);
    expect(last.rotation_viable).toBe(study.verdict.rotation_viable);
  });

  it("last mirrors summary market-structure (tvl / volume / pools)", () => {
    expect(last.tvl_usd_total).toBe(summary.tvl_usd_total);
    expect(last.volume_24h_usd_clean).toBe(summary.volume_24h_usd_clean);
    expect(last.pools_live).toBe(summary.pools_live);
    expect(last.pools_total).toBe(summary.pools_total);
  });
});
