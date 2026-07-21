import type { Summary } from "../../api/types";
import { measuredLabel } from "../../lib/format";
import CopyButton from "../ui/CopyButton";

/** Reproducibility + provenance footer. */
export default function Footer({ summary }: { summary: Summary }) {
  return (
    <footer className="mt-8 border-t border-edge pt-5 text-[12.5px] leading-relaxed text-muted">
      <p>
        Every number regenerates bit-for-bit from the committed dataset:{" "}
        <code className="rounded-sm bg-muted/15 px-1 font-mono text-ink">make stacks_harvest</code> →{" "}
        <code className="rounded-sm bg-muted/15 px-1 font-mono text-ink">make stacks_study ARGS=&quot;--check&quot;</code>.
        Reserves read on-chain via Hiro <code className="rounded-sm bg-muted/15 px-1 font-mono text-ink">call-read</code>{" "}
        ({summary.hiro_stats.requests} requests, {summary.hiro_stats.errors} errors).
      </p>
      <p className="mt-2">
        Snapshot {summary.as_of_date} ({measuredLabel(summary.as_of_date)}) · auto re-harvests every 6h · dataset digest{" "}
        <code className="rounded-sm bg-muted/15 px-1 font-mono text-ink">{summary.digest.slice(0, 16)}…</code>{" "}
        <CopyButton text={summary.digest} label="copy digest" /> · MIT · no custody, no funds. Chain is source of truth;
        vendor APIs are the cross-check.
      </p>
    </footer>
  );
}
