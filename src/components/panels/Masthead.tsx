import StatusPill from "../ui/StatusPill";
import { useTheme } from "../../hooks/useTheme";

/** Title band + freshness pill + theme toggle. */
export default function Masthead({ asOf, live }: { asOf: string; live: boolean }) {
  const { theme, toggle } = useTheme();
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
        {live ? (
          <StatusPill tone="up" dot pulse srText="live from /api/stacks/dashboard">
            LIVE
          </StatusPill>
        ) : (
          <StatusPill tone="neutral" dot srText="committed snapshot — no live backend attached">
            SNAPSHOT · {asOf}
          </StatusPill>
        )}
        <span className="opacity-80">chain is source of truth · vendor APIs are the cross-check</span>
      </div>
    </header>
  );
}
