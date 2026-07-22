import { describe, it, expect } from "vitest";

import { sectionId } from "./sections";

describe("sections.ts sectionId", () => {
  it("slugs a label: lowercase, non-alphanumeric runs → single '-', trimmed", () => {
    expect(sectionId("Live cross-check")).toBe("sec-live-cross-check");
    expect(sectionId("Pool compare")).toBe("sec-pool-compare");
    expect(sectionId("Move $X")).toBe("sec-move-x");
    expect(sectionId("  Verdict!!  ")).toBe("sec-verdict");
    expect(sectionId("The evidence")).toBe("sec-the-evidence");
  });
});
