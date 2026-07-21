import { useEffect, useMemo, useState } from "react";

import type { Facts } from "../../api/types";
import { TRACE_CLAIM_EVENT } from "../../lib/cockpit";
import Card from "../ui/Card";
import CopyButton from "../ui/CopyButton";

function fmtValue(v: number | string | boolean): string {
  if (typeof v === "number") return v.toLocaleString("en-US");
  return String(v);
}

/** Every headline number, searchable & filterable, each traced to an on-chain read or a named endpoint. */
export default function Provenance({ facts }: { facts: Facts }) {
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<string>("all");
  const [flashKey, setFlashKey] = useState<string | null>(null);

  // Deep-link from a "trace → source" chip: clear filters so the claim renders, then flash it.
  useEffect(() => {
    const onTrace = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      if (!key) return;
      setQ("");
      setSrc("all");
      setFlashKey(key);
    };
    window.addEventListener(TRACE_CLAIM_EVENT, onTrace);
    return () => window.removeEventListener(TRACE_CLAIM_EVENT, onTrace);
  }, []);

  useEffect(() => {
    if (!flashKey) return;
    const el = document.getElementById(`claim-${flashKey}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("nav-flash");
      void el.offsetWidth; // reflow so the highlight re-triggers
      el.classList.add("nav-flash");
    }
    const t = window.setTimeout(() => setFlashKey(null), 1600);
    return () => window.clearTimeout(t);
  }, [flashKey]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const c of facts.claims) set.add(c.source.split(" ")[0]); // first token as a coarse bucket
    return ["all", ...Array.from(set).sort()];
  }, [facts]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return facts.claims.filter((c) => {
      const matchQ = !needle || `${c.key} ${c.note} ${c.source} ${c.value}`.toLowerCase().includes(needle);
      const matchSrc = src === "all" || c.source.startsWith(src);
      return matchQ && matchSrc;
    });
  }, [facts, q, src]);

  return (
    <Card label="Provenance — every number, checkable" tier="detail" right={<CopyButton text={facts.dataset_digest} label="copy digest" />}>
      <p className="mb-3 text-[12px] text-muted">
        {facts.claims.length} claims, each traced to an on-chain read or a named vendor endpoint. Dataset digest{" "}
        <code className="rounded-sm bg-muted/15 px-1 font-mono text-[11px] text-sub">{facts.dataset_digest.slice(0, 16)}…</code>
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search claims…"
          className="flex-1 min-w-[160px] rounded-sm border border-edge bg-panel2 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition focus:border-brand/70 placeholder:text-muted"
        />
        <div className="flex flex-wrap gap-1">
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSrc(s)}
              className={`rounded-sm border px-2 py-1 font-mono text-[10px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
                src === s ? "border-brand bg-brand/10 text-brand" : "border-edge text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-edge text-left font-mono text-[10.5px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3 font-semibold">Claim</th>
              <th className="py-1.5 px-3 text-right font-semibold">Value</th>
              <th className="py-1.5 pl-3 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr
                key={c.key}
                id={`claim-${c.key}`}
                className={`border-b border-edge/50 align-top scroll-mt-28 transition-colors ${flashKey === c.key ? "bg-brand/10" : ""}`}
              >
                <td className="py-1.5 pr-3">
                  <div className="font-mono text-sub">{c.key}</div>
                  <div className="text-[11px] leading-snug text-muted">{c.note}</div>
                </td>
                <td className="py-1.5 px-3 text-right font-mono tabular-nums text-ink">{fmtValue(c.value)}</td>
                <td className="py-1.5 pl-3 text-[11.5px] leading-snug text-muted">{c.source}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-xs text-muted">no matching claims</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 font-mono text-[10px] text-muted">
        showing {shown.length} / {facts.claims.length} claims
      </div>
    </Card>
  );
}
