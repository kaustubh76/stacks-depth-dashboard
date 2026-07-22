import StatusPill from "../ui/StatusPill";
import { useTheme } from "../../hooks/useTheme";
import { daysSince, measuredLabel } from "../../lib/format";

/** Title band + freshness pill + theme toggle. */
export default function Masthead({ asOf }: { asOf: string }) {
  const { theme, toggle } = useTheme();
  const stale = daysSince(asOf) > 2;
  return (
    <header className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
            Stacks Depth · market-structure instrument
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            How much can actually move on Stacks DeFi?
          </h1>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          className="shrink-0 rounded-sm border border-edge px-2.5 py-1 font-mono text-xs text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          {theme === "dark" ? "☀ light" : "☾ dark"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[12px] text-muted">
        <StatusPill tone={stale ? "warn" : "up"} dot srText={`on-chain measurement ${measuredLabel(asOf)}`}>
          {measuredLabel(asOf)}
        </StatusPill>
        <span>
          {asOf} snapshot · re-harvests every 6h · chain is source of truth, vendor APIs cross-check
        </span>
      </div>
    </header>
  );
}
