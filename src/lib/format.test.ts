import { describe, it, expect } from "vitest";

import { usd0, usd, usdCompact, pct, signedPct, int, ago, daysSince, measuredLabel, shortHash } from "./format";

describe("format.ts", () => {
  it("usd0: whole-dollar, thousands-separated, — for nullish/NaN", () => {
    expect(usd0(1234.6)).toBe("$1,235");
    expect(usd0(0)).toBe("$0");
    expect(usd0(null)).toBe("—");
    expect(usd0(undefined)).toBe("—");
    expect(usd0(NaN)).toBe("—");
  });

  it("usd: fixed decimals", () => {
    expect(usd(1234.5)).toBe("$1,234.50");
    expect(usd(1, 0)).toBe("$1");
    expect(usd(null)).toBe("—");
  });

  it("usdCompact: k/M/B thresholds (k ignores dp via toFixed(0))", () => {
    expect(usdCompact(1_487_377)).toBe("$1.49M");
    expect(usdCompact(1_500)).toBe("$2k");
    expect(usdCompact(999)).toBe("$999");
    expect(usdCompact(2.5e9)).toBe("$2.50B");
    expect(usdCompact(1e6)).toBe("$1.00M");
    expect(usdCompact(1e3)).toBe("$1k");
    expect(usdCompact(null)).toBe("—");
  });

  it("pct + signedPct", () => {
    expect(pct(0.02)).toBe("2%");
    expect(pct(0.02, 2)).toBe("2.00%");
    expect(pct(-0.5)).toBe("-50%");
    expect(signedPct(-0.48)).toBe("-48.0%");
    expect(signedPct(0.02)).toBe("+2.0%");
    expect(signedPct(0)).toBe("+0.0%");
    expect(pct(null)).toBe("—");
  });

  it("int", () => {
    expect(int(1234.6)).toBe("1,235");
    expect(int(null)).toBe("—");
  });

  it("ago: relative time from a fixed now (deterministic)", () => {
    const now = 1_000_000_000_000;
    expect(ago(now - 5_000, now)).toBe("5s ago");
    expect(ago(now - 120_000, now)).toBe("2m ago");
    expect(ago(now - 7_200_000, now)).toBe("2h ago");
    expect(ago(now + 5_000, now)).toBe("0s ago"); // future clamped
    expect(ago(0, now)).toBe("—");
    expect(ago(null, now)).toBe("—");
  });

  it("daysSince + measuredLabel: deterministic via now", () => {
    const now = Date.parse("2026-07-22T00:00:00Z");
    expect(daysSince("2026-07-22", now)).toBe(0);
    expect(daysSince("2026-07-21", now)).toBe(1);
    expect(daysSince("2026-07-20", now)).toBe(2);
    expect(daysSince("2026-08-01", now)).toBe(0); // future clamps
    expect(daysSince("not-a-date", now)).toBe(0);
    expect(measuredLabel("2026-07-22", now)).toBe("measured today");
    expect(measuredLabel("2026-07-21", now)).toBe("measured yesterday");
    expect(measuredLabel("2026-07-19", now)).toBe("measured 3 days ago");
  });

  it("shortHash: truncation boundary at length 14", () => {
    expect(shortHash(null)).toBe("—");
    expect(shortHash("0123456789012")).toBe("0123456789012"); // 13 → full
    expect(shortHash("01234567890123")).toBe("0123456789…0123"); // 14 → truncated
  });
});
