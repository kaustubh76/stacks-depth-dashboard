// The "cockpit" layer's single source of truth: the window-event bus the overlays open
// on, the keyboard maps the KeyboardLayer + Cheatsheet share, the guided-tour script, and
// a helper the keyboard layer uses to stand down while any overlay is up. Nav targets
// reference panel labels (the same strings stamped onto `[data-section-label]`), so a key
// always resolves to a real scroll target via `sectionId(label)` — no drift.

/** Fire to open the keyboard-shortcuts cheatsheet (`?`, the ⌘K palette, the header chip). */
export const OPEN_CHEATSHEET_EVENT = "sd:cheatsheet";
/** Fire to start the guided tour (dispatched by the ⌘K palette / header chip). */
export const START_TOUR_EVENT = "sd:tour";
/** Fire to focus the Trade planner's size input (dispatched by the ⌘K "Plan a trade" action). */
export const FOCUS_PLANNER_EVENT = "sd:plan-focus";
/** Fire (detail: {bandId}) to expand a collapsed SectionBand before scrolling to it. */
export const OPEN_SECTION_EVENT = "sd:open-section";

/** `g`-then-key quick-nav. Curated, collision-free letters → panel labels. */
export interface NavKey {
  key: string;
  label: string;
}
export const NAV_KEYS: NavKey[] = [
  { key: "l", label: "Live cross-check" },
  { key: "v", label: "Verdict" },
  { key: "h", label: "Headline" },
  { key: "u", label: "Slippage budget" }, // bUdget
  { key: "s", label: "Scenarios" },
  { key: "x", label: "Trade planner" }, // move $X
  { key: "e", label: "Slippage explorer" },
  { key: "c", label: "Depth calculator" },
  { key: "o", label: "Pool browser" }, // pOols
  { key: "w", label: "Pool compare" }, // weigh side-by-side
  { key: "m", label: "Movable by budget" },
  { key: "a", label: "Asset depth" },
  { key: "q", label: "Data quality" },
  { key: "n", label: "Venues" },
  { key: "b", label: "Rotation backtest" },
  { key: "p", label: "Provenance" },
];

/** Safe single-key power actions. */
export type PowerAction = "cheatsheet" | "theme" | "refreshLive";
export interface PowerKey {
  key: string;
  label: string;
  action: PowerAction;
}
export const POWER_KEYS: PowerKey[] = [
  { key: "?", label: "Keyboard shortcuts", action: "cheatsheet" },
  { key: "t", label: "Toggle theme", action: "theme" },
  { key: "r", label: "Refresh live data", action: "refreshLive" },
];

/** Ordered narration for the guided tour. Filtered at runtime to panels present in the DOM. */
export interface TourStep {
  label: string;
  narration: string;
}
export const TOUR_STEPS: TourStep[] = [
  { label: "Live cross-check", narration: "Live from the chain and public feeds: Stacks block height, STX/BTC price, and DEX volume — a real-time check on the frozen measurement below." },
  { label: "Verdict", narration: "The headline finding: how much can actually move on Stacks DeFi, and whether systematic trading is viable yet. Poke the what-if thresholds and watch it flip." },
  { label: "Trade planner", narration: "Pick an asset, set a size, hit Plan — best pool, expected slippage, and how the trade splits when one pool can't absorb it." },
  { label: "Slippage explorer", narration: "Drag the trade-size handle — read the exact price impact each pool would charge, and which assets clear your slippage budget." },
  { label: "Depth calculator", narration: "Ask it directly: type a dollar size, and see the slippage you'd pay per asset and whether the ecosystem can absorb it." },
  { label: "Pool browser", narration: "Every measured pool — filter by venue or asset, sort by what you can actually move at your budget, export the table as CSV." },
  { label: "Pool compare", narration: "Pit two or three pools against each other: overlaid slippage curves and side-by-side depth at your current budget." },
  { label: "Movable by budget", narration: "Move the slippage-budget slider and watch total movable capital + the verdict recompute — the same math as the published snapshot." },
  { label: "Asset depth", narration: "Per-asset movable capital at your chosen budget. One or two assets carry almost all of it." },
  { label: "Data quality", narration: "The honesty layer: the vendor-feed outliers we flagged, cross-feed price disagreements, and an independent cross-check." },
  { label: "Rotation backtest", narration: "A second angle: a momentum rotation loses money at every realistic friction — corroborating the depth verdict." },
  { label: "Provenance", narration: "Every headline number, traced to an on-chain read or a named vendor endpoint. Reproducible bit-for-bit." },
];

/** True while any cockpit overlay is mounted — the keyboard layer stands down. */
export function overlayOpen(): boolean {
  return !!document.querySelector(".mc-overlay");
}
