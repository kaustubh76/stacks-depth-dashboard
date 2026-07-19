import { useState } from "react";

import type { Facts } from "../../api/types";
import Card from "../ui/Card";
import CopyButton from "../ui/CopyButton";

function fmtValue(v: number | string | boolean): string {
  if (typeof v === "number") return v.toLocaleString("en-US");
  return String(v);
}

/** Every headline number, independently checkable: value, on-chain/API source, and a note. */
export default function Provenance({ facts }: { facts: Facts }) {
  const [open, setOpen] = useState(false);
  const shown = open ? facts.claims : facts.claims.slice(0, 8);
  return (
    <Card
      label="Provenance — every number, checkable"
      tier="detail"
      right={<CopyButton text={facts.dataset_digest} label="copy digest" />}
    >
      <p className="mb-3 text-[12px] text-muted">
        {facts.claims.length} claims, each traced to an on-chain read or a named vendor endpoint. Dataset digest{" "}
        <code className="rounded-sm bg-muted/15 px-1 font-mono text-[11px] text-sub">
          {facts.dataset_digest.slice(0, 16)}…
        </code>
      </p>
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
              <tr key={c.key} className="border-b border-edge/50 align-top">
                <td className="py-1.5 pr-3">
                  <div className="font-mono text-sub">{c.key}</div>
                  <div className="text-[11px] leading-snug text-muted">{c.note}</div>
                </td>
                <td className="py-1.5 px-3 text-right font-mono tabular-nums text-ink">{fmtValue(c.value)}</td>
                <td className="py-1.5 pl-3 text-[11.5px] leading-snug text-muted">{c.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {facts.claims.length > 8 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-3 rounded-sm border border-edge px-2.5 py-1 font-mono text-[11px] text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          {open ? "show fewer" : `show all ${facts.claims.length} claims`}
        </button>
      )}
    </Card>
  );
}
