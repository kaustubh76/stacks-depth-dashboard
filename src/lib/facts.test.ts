import { describe, it, expect } from "vitest";

import factsJson from "../data/facts.json";
import summaryJson from "../data/summary.json";
import type { Facts, Summary } from "../api/types";

// facts.json is the provenance table the Provenance panel renders and the "trace → source" chips
// deep-link into. It's derived from the same harvest as summary.json, so it must stay in lock-step;
// and every claim value must be a type the UI can render (null renders as "—", never the word "null").
// Runs in CI + the reharvest gate, so a digest drift or a malformed claim fails before it ships.
const facts = factsJson as unknown as Facts;
const summary = summaryJson as unknown as Summary;

describe("facts.json is consistent with the snapshot", () => {
  it("dataset_digest and as_of_date match summary", () => {
    expect(facts.dataset_digest).toBe(summary.digest);
    expect(facts.as_of_date).toBe(summary.as_of_date);
  });

  it("every claim has a key + source and a renderable (finite | string | boolean | null) value", () => {
    expect(facts.claims.length).toBeGreaterThan(0);
    for (const c of facts.claims) {
      expect(typeof c.key).toBe("string");
      expect(c.key.length).toBeGreaterThan(0);
      expect(typeof c.source).toBe("string");
      const v = c.value as unknown;
      const renderable =
        v === null ||
        typeof v === "string" ||
        typeof v === "boolean" ||
        (typeof v === "number" && Number.isFinite(v));
      expect(renderable).toBe(true);
    }
  });

  it("claim keys are unique", () => {
    const keys = facts.claims.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
