import { useEffect, useState } from "react";

import { useTheme } from "../hooks/useTheme";
import { flashSection, sectionId } from "../lib/sections";
import { OPEN_PALETTE_EVENT } from "./cockpit/CommandPalette";
import StatusPill from "./ui/StatusPill";

const CHIPS = ["Trade planner", "Slippage explorer", "Pool browser", "Verdict", "Data quality"];

/** Compact bar that slides in after scrolling past the masthead: the verdict at a glance,
 * quick jumps, the ⌘K hint, and theme/live toggles. */
export default function StickyHeader({
  movableText,
  live,
  liveEnabled,
  onToggleLive,
}: {
  movableText: string;
  live: boolean;
  liveEnabled: boolean;
  onToggleLive: () => void;
}) {
  const { theme, toggle } = useTheme();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 top-0 z-40 border-b-3 border-[color:var(--thick-line)] bg-panel/95 backdrop-blur transition-transform duration-200 ${
        shown ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <span className="hidden font-display text-xs font-bold uppercase tracking-wider text-brand sm:inline">Stacks Depth</span>
        <span className="font-mono text-[12px] text-sub">
          <b className="text-brand">{movableText}</b> movable @≤2%
        </span>
        <div className="ml-2 hidden items-center gap-1 md:flex">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => flashSection(sectionId(c))}
              className="rounded-sm px-1.5 py-0.5 font-mono text-[10.5px] text-muted transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              {c.split(" ")[c.split(" ").length > 1 ? 1 : 0]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleLive}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            aria-label={liveEnabled ? "pause live data" : "resume live data"}
            title={liveEnabled ? "pause live data" : "resume live data"}
          >
            <StatusPill tone={liveEnabled && live ? "up" : "neutral"} dot pulse={liveEnabled && live}>
              {liveEnabled ? (live ? "LIVE" : "…") : "PAUSED"}
            </StatusPill>
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            ⌘K
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label="toggle theme"
            className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </div>
    </div>
  );
}
