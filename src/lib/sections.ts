// A stable slug for a panel label, so MissionControl can stamp each panel wrapper
// with a scroll-target id and the CommandPalette can jump to it. The palette
// discovers the actual panels from the DOM at open time (elements carrying
// `data-section-label`), so this stays in sync even as panels are added/renamed.

import { TRACE_CLAIM_EVENT } from "./cockpit";

export function sectionId(label: string): string {
  return "sec-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Smooth-scroll a panel into view and re-trigger the `.nav-flash` highlight ring. If the target
 * lives inside a collapsed SectionBand, expand that band first (dispatch OPEN_SECTION_EVENT), then
 * scroll on the next tick. Shared by the command palette, keyboard layer, header + headline tiles. */
export function flashSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const band = el.closest<HTMLElement>("[data-band-id]");
  const flash = () => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("nav-flash");
    void el.offsetWidth; // reflow so the animation re-triggers even if recently flashed
    el.classList.add("nav-flash");
    window.setTimeout(() => el.classList.remove("nav-flash"), 1300);
  };
  if (band) {
    window.dispatchEvent(new CustomEvent("sd:open-section", { detail: { bandId: band.getAttribute("data-band-id") } }));
    window.setTimeout(flash, 90); // let the band expand before scrolling
  } else {
    flash();
  }
}

/** Deep-link to a specific Provenance claim row: open the evidence band + scroll Provenance into
 * view, then tell the panel to clear its filters and flash the exact claim. Backs the "trace →
 * source" chips in the reasoning reveals. */
export function traceClaim(key: string): void {
  flashSection(sectionId("Provenance"));
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(TRACE_CLAIM_EVENT, { detail: { key } }));
  }, 140);
}
