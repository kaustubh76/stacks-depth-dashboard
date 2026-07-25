import { describe, it, expect } from "vitest";

import grantJson from "../data/grant.json";
import studyJson from "../data/study.json";
import summaryJson from "../data/summary.json";
import factsJson from "../data/facts.json";
import type { Study, Summary, Facts } from "../api/types";
import { type Grant, citableFinding, budgetTotals } from "./grant";

// grant.json is the static ASK (budget/milestones from Degrants.md); every MEASURED number renders from
// the live study/summary/facts. These assertions run in CI + the reharvest gate: the budget must stay
// internally consistent, the self-correction must point at a real (still-downward) facts claim, and the
// citation must carry the LIVE finding — so a drift in either the ask or the snapshot fails before ship.
const grant = grantJson as unknown as Grant;
const study = studyJson as unknown as Study;
const summary = summaryJson as unknown as Summary;
const facts = factsJson as unknown as Facts;

describe("grant.json is internally consistent (the ask)", () => {
  it("budget columns sum to their milestone totals and to budget_total", () => {
    const t = budgetTotals(grant);
    expect(t.m1).toBe(grant.budget_by_milestone.m1);
    expect(t.m2).toBe(grant.budget_by_milestone.m2);
    expect(t.m3).toBe(grant.budget_by_milestone.m3);
    expect(t.total).toBe(grant.budget_total);
    for (const r of grant.budget) expect(r.m1 + r.m2 + r.m3).toBe(r.total); // each row is self-consistent
  });

  it("milestone asks + per-milestone budget both sum to budget_total, which equals ask_usd", () => {
    const mSum = grant.milestones.reduce((s, m) => s + m.usd, 0);
    const bm = grant.budget_by_milestone;
    expect(mSum).toBe(grant.budget_total);
    expect(bm.m1 + bm.m2 + bm.m3).toBe(grant.budget_total);
    expect(grant.ask_usd).toBe(grant.budget_total);
  });

  it("has three milestones, a valid ask range, and non-empty honesty lists", () => {
    expect(grant.milestones.length).toBe(3);
    expect(grant.claims.length).toBeGreaterThan(0);
    expect(grant.does_not_claim.length).toBeGreaterThan(0);
    expect(grant.ask_usd).toBeGreaterThanOrEqual(grant.ask_range_usd[0]);
    expect(grant.ask_usd).toBeLessThanOrEqual(grant.ask_range_usd[1]);
  });
});

describe("grant wiring stays honest against the live snapshot", () => {
  it("self_correction.claim_key resolves to a real, still-downward facts claim", () => {
    const claim = facts.claims.find((c) => c.key === grant.self_correction.claim_key);
    expect(claim).toBeTruthy();
    const v = Number(claim!.value);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeLessThan(grant.self_correction.earlier_usd); // the correction is genuinely downward
  });

  it("citableFinding carries the LIVE finding + repo, not a hardcoded number", () => {
    const cite = citableFinding(study, summary, grant);
    expect(cite).toContain(grant.repo_url);
    expect(cite).toContain(summary.as_of_date);
    expect(cite).toContain(study.verdict.finding.trim().slice(0, 40)); // the actual measured text
    expect(cite).toContain("$5,000");
  });
});
