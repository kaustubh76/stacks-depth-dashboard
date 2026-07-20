import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { sectionId } from "../lib/sections";
import { OPEN_SECTION_EVENT } from "../lib/cockpit";

/**
 * A collapsible top-level section that groups panels. The wrapper carries the id +
 * data-section-label (so nav/palette/tour resolve to it) + data-band-id (so flashSection can
 * auto-expand it before scrolling to a nested panel). Children stay MOUNTED and are hidden with
 * CSS when collapsed — so live data keeps flowing and `getElementById` finds nested targets even
 * while closed. Open/closed persists per section in localStorage.
 */
export default function SectionBand({
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const id = sectionId(title);
  const key = `sd.band.${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });

  // Auto-expand when a nav jump targets this band (or a panel inside it).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ bandId?: string }>).detail;
      if (detail?.bandId === id) setOpen(true);
    };
    window.addEventListener(OPEN_SECTION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen);
  }, [id]);

  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* storage unavailable — in-memory only */
      }
      return next;
    });

  return (
    <section id={id} data-section-label={title} data-band-id={id} className="mb-6 scroll-mt-28">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group mb-3 flex w-full items-center gap-3 text-left focus:outline-none"
      >
        <span className="font-display text-sm font-bold uppercase tracking-[0.16em] text-ink transition-colors group-hover:text-brand">
          {title}
        </span>
        {summary && <span className="hidden font-mono text-[11px] text-muted sm:inline">{summary}</span>}
        <span className="h-px flex-1 bg-edge" />
        <span className="font-mono text-[11px] text-muted transition-colors group-hover:text-brand" aria-hidden>
          {open ? "collapse ▾" : "expand ▸"}
        </span>
      </button>
      <div className={open ? "flex flex-col gap-4" : "hidden"}>{children}</div>
    </section>
  );
}
