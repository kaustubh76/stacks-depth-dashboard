// The grant wrapper. `src/data/grant.json` is STATIC proposal config (the ask, milestones, budget —
// sourced from Degrants.md), imported directly by the About route. Every MEASURED number renders from
// the live study/summary/facts instead, so nothing here drifts on a re-harvest — grant.json holds only
// the ask, never a measurement.

import type { Study, Summary } from "../api/types";
import { usd0 } from "./format";

export interface GrantMilestone {
  id: string;
  title: string;
  weeks: string;
  usd: number;
  deliverable: string;
  status: string;
}

export interface GrantBudgetRow {
  line: string;
  m1: number;
  m2: number;
  m3: number;
  total: number;
}

export interface GrantSelfCorrection {
  claim_key: string; // resolves to a facts.json claim — the corrected value is read LIVE from there
  earlier_usd: number; // the fixed historical "$75k" we corrected downward (safe to state)
  context: string;
}

export interface Grant {
  program: string;
  host: string;
  funder: string;
  applicant_type: string;
  review: string;
  category: string;
  ask_usd: number;
  ask_range_usd: [number, number];
  duration_weeks: number;
  one_liner: string;
  problem: string;
  public_good: string;
  who_is_hurt: string;
  milestones: GrantMilestone[];
  budget: GrantBudgetRow[];
  budget_by_milestone: { m1: number; m2: number; m3: number };
  budget_total: number;
  no_audit_line: string;
  claims: string[];
  does_not_claim: string[];
  self_correction: GrantSelfCorrection;
  repo_url: string;
}

/** The one-paragraph, copy-pasteable citation of the measured finding + the proposal it backs.
 * Mirrors `scenarioSummary()` in export.ts: the measured text comes from the live `study.verdict.finding`
 * and `summary.as_of_date`, never from grant.json, so a re-harvest updates the citation automatically. */
export function citableFinding(study: Study, summary: Summary, grant: Grant): string {
  const f = study.verdict.finding.trim();
  const finding = /[.!?]$/.test(f) ? f : `${f}.`;
  return (
    `Stacks Depth (measured ${summary.as_of_date}): ${finding} ` +
    `Reproducible dataset + methodology: ${grant.repo_url}. ` +
    `A ${grant.program} public-good proposal — ${usd0(grant.ask_usd)} over ${grant.duration_weeks} weeks.`
  );
}

/** Column + grand totals recomputed from the budget rows, so the test can assert the table is
 * internally consistent (each column sums to its milestone; the grand total equals budget_total). */
export function budgetTotals(grant: Grant): { m1: number; m2: number; m3: number; total: number } {
  return grant.budget.reduce(
    (acc, r) => ({ m1: acc.m1 + r.m1, m2: acc.m2 + r.m2, m3: acc.m3 + r.m3, total: acc.total + r.total }),
    { m1: 0, m2: 0, m3: 0, total: 0 },
  );
}
