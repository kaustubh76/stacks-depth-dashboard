import { useEffect, useState } from "react";

import { useTheme } from "../hooks/useTheme";
import { flashSection, sectionId } from "../lib/sections";
import { OPEN_PALETTE_EVENT } from "./cockpit/CommandPalette";
import StatusPill from "./ui/StatusPill";
import type { ApiStatus } from "../api/data";

export interface NavSection {
  label: string; // must match a SectionBand title
  short: string; // compact chip label
}

/**
 * The persistent top bar: brand + headline movable + section nav (with scroll-spy active state)
 * + live pill + ⌘K + theme. Always visible (sticky), so the 6-band IA is navigable from
 * anywhere. Clicking a section auto-expands + scrolls to it via flashSection.
 */
export default function StickyHeader({
  movableText,
  apiStatus,
  feedsLive,
  liveEnabled,
  onToggleLive,
  sections,
}: {
  movableText: string;
  apiStatus: ApiStatus; // the dataset's backend liveness (the truthful "is this live" signal)
  feedsLive: boolean; // the external market feeds (CoinGecko/Hiro/DexScreener) — a separate axis
  liveEnabled: boolean;
  onToggleLive: () => void;
  sections: NavSection[];
}) {
  const { theme, toggle } = useTheme();
  const [active, setActive] = useState<string>(sections[0]?.label ?? "");

  // Scroll-spy: highlight the section whose band is nearest the top of the viewport.
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(sectionId(s.label)))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const lbl = vis[0]?.target.getAttribute("data-section-label");
        if (lbl) setActive(lbl);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  return (
    <header className="sticky top-0 z-40 w-full border-b-3 border-[color:var(--thick-line)] bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="hidden font-display text-xs font-bold uppercase tracking-wider text-brand transition hover:opacity-80 focus:outline-none sm:inline"
        >
          Stacks Depth
        </button>
        <span className="hidden font-mono text-[12px] text-sub lg:inline">
          <b className="text-brand">{movableText}</b> movable @≤2%
        </span>
        <nav aria-label="Sections" className="flex items-center gap-1 overflow-x-auto">
          {sections.map((s) => {
            const on = active === s.label;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => flashSection(sectionId(s.label))}
                aria-current={on ? "true" : undefined}
                className={`shrink-0 rounded-sm px-2 py-0.5 font-mono text-[11px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
                  on ? "bg-brand/10 text-brand" : "text-muted hover:text-brand"
                }`}
              >
                {s.short}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          {/* Dataset liveness — the truthful "is this page showing live or baked data" signal. */}
          <StatusPill
            tone={apiStatus === "live" ? "up" : apiStatus === "offline" ? "warn" : "neutral"}
            dot
            pulse={apiStatus === "live"}
            srText={
              apiStatus === "live"
                ? "dataset is live from the Stacks Depth API"
                : apiStatus === "offline"
                  ? "API unreachable — showing the committed snapshot"
                  : "connecting to the backend API"
            }
          >
            {apiStatus === "live" ? "LIVE" : apiStatus === "offline" ? "SNAPSHOT" : "…"}
          </StatusPill>
          {/* Market feeds (CoinGecko/Hiro/DexScreener) — a SEPARATE axis; this toggles them. */}
          <button
            type="button"
            onClick={onToggleLive}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            aria-label={liveEnabled ? "pause market feeds" : "resume market feeds"}
            title={liveEnabled ? "pause market feeds" : "resume market feeds"}
          >
            <StatusPill tone={liveEnabled && feedsLive ? "info" : "neutral"} dot pulse={liveEnabled && feedsLive}>
              {liveEnabled ? (feedsLive ? "FEEDS" : "…") : "PAUSED"}
            </StatusPill>
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            className="rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            title="command palette"
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
    </header>
  );
}
