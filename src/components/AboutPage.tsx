import grantJson from "../data/grant.json";
import type { Study, Summary, Facts } from "../api/types";
import { type Grant, citableFinding } from "../lib/grant";
import { traceClaim } from "../lib/sections";
import { useTheme } from "../hooks/useTheme";
import { usd0, measuredLabel } from "../lib/format";
import { UP, DOWN, MUTED } from "../lib/colors";
import Card from "./ui/Card";
import StatusPill from "./ui/StatusPill";
import CopyButton from "./ui/CopyButton";
import SkipLink from "./ui/SkipLink";

const grant = grantJson as unknown as Grant;

/**
 * The proposal PAGE — a real, deep-linkable destination (#v=about) that wraps the instrument in its
 * grant framing: the finding stated cleanly + citable, the ask, why depth matters, milestones, budget,
 * the honesty sheet, the self-correction, and how we measure. All content is real — the ASK comes from
 * the committed grant.json (Degrants.md); every MEASURED number renders live from study/summary/facts,
 * so nothing here drifts on a re-harvest.
 */
export default function AboutPage({
  study,
  summary,
  facts,
  onClose,
  shareLink,
}: {
  study: Study;
  summary: Summary;
  facts: Facts;
  onClose: () => void;
  shareLink: () => string;
}) {
  const { theme, toggle } = useTheme();
  const v = study.verdict;
  const viable = v.rotation_viable;
  const accent = viable ? "#43b581" : "#e0728a";
  const cite = citableFinding(study, summary, grant);

  // Live facts (never hardcoded) — the motivation numbers + the self-correction value.
  const claim = (key: string) => facts.claims.find((c) => c.key === key);
  const alexDead = claim("alex_pools_dead")?.value;
  const alexTotal = claim("alex_pools_total")?.value;
  const corrected = Number(claim(grant.self_correction.claim_key)?.value ?? 0);
  const foldMultiple = corrected > 0 ? Math.round(grant.self_correction.earlier_usd / corrected) : null;

  const backBtn =
    "rounded-sm border border-edge px-2.5 py-1 font-mono text-[11px] text-sub transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";

  return (
    <div className="min-h-screen">
      <SkipLink />
      {/* Top bar */}
      <div className="sticky top-0 z-40 w-full border-b-3 border-[color:var(--thick-line)] bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2">
          <button type="button" onClick={onClose} className={backBtn}>
            ← Dashboard
          </button>
          <span className="font-display text-xs font-bold uppercase tracking-wider text-brand">The proposal</span>
          <div className="ml-auto flex items-center gap-1.5">
            <CopyButton text={shareLink()} label="share link" />
            <CopyButton text={cite} label="cite finding" />
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

      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-8 outline-none sm:px-6">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
          {grant.program} · {grant.funder} · public good
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {grant.one_liner}
        </h1>
        <p className="mt-2 font-mono text-[12px] text-muted">
          a working MVP backs every claim on this page · {measuredLabel(summary.as_of_date)} · this dashboard is the
          artifact, not a slide deck
        </p>

        {/* 1 · The finding, cleanly stated + one paste-able citation */}
        <Card tier="hero" accent={accent} className="mt-6" label="The finding">
          <p className="font-display text-[15px] font-semibold leading-relaxed text-ink sm:text-base">{v.finding}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill tone={viable ? "up" : "down"} dot srText="rotation viability">
              {viable ? "rotation viable" : "not currently viable"}
            </StatusPill>
            <CopyButton text={cite} label="copy citation" />
            <span className="font-mono text-[11px] text-muted">← a steward can paste this verbatim</span>
          </div>
        </Card>

        {/* 2 · The ask */}
        <Card tier="supporting" className="mt-4" label="The ask">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="brand">{usd0(grant.ask_usd)}</StatusPill>
            <StatusPill tone="neutral">{grant.duration_weeks} weeks</StatusPill>
            <StatusPill tone="neutral">{grant.milestones.length} milestones</StatusPill>
            <StatusPill tone="up" dot srText="the design holds no funds">
              no custody · no audit line
            </StatusPill>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-sub">{grant.no_audit_line}</p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted">
            {grant.program} · hosted by {grant.host} · funded by the {grant.funder} · reviewed by {grant.review} ·{" "}
            {grant.applicant_type}
          </p>
        </Card>

        {/* 3 · Why depth matters / who's hurt */}
        <Card tier="supporting" className="mt-4" label="Why depth matters">
          <p className="text-[13.5px] leading-relaxed text-sub">{grant.problem}</p>
          {alexDead != null && alexTotal != null && (
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink">
              Measured today:{" "}
              <span className="font-bold" style={{ color: DOWN }}>
                {String(alexDead)} of {String(alexTotal)}
              </span>{" "}
              ALEX pools are dead. <span className="text-sub">Who's hurt: {grant.who_is_hurt}</span>
            </p>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-sub">
            <span className="font-semibold text-ink">The public good.</span> {grant.public_good}
          </p>
        </Card>

        {/* 4 · Milestones */}
        <div className="mt-4">
          <div className="card-label mb-2">Milestones — each independently useful, all three built</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {grant.milestones.map((m) => (
              <Card key={m.id} tier="detail">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold text-brand">
                    {m.id} · {m.title}
                  </span>
                  <StatusPill tone="up" srText="already built">
                    {m.status}
                  </StatusPill>
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted">
                  weeks {m.weeks} · {usd0(m.usd)}
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-sub">{m.deliverable}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* 5 · Budget */}
        <Card tier="supporting" className="mt-4" label={`Budget — ${usd0(grant.budget_total)}`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-edge text-left font-mono text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-semibold">Line</th>
                  <th className="py-1.5 px-3 text-right font-semibold">M1</th>
                  <th className="py-1.5 px-3 text-right font-semibold">M2</th>
                  <th className="py-1.5 px-3 text-right font-semibold">M3</th>
                  <th className="py-1.5 pl-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {grant.budget.map((r) => (
                  <tr key={r.line} className="border-b border-edge/50">
                    <td className="py-1.5 pr-3 text-sub">{r.line}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{r.m1 ? usd0(r.m1) : "—"}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{r.m2 ? usd0(r.m2) : "—"}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-sub">{r.m3 ? usd0(r.m3) : "—"}</td>
                    <td className="py-1.5 pl-3 text-right font-mono tabular-nums font-bold text-ink">{usd0(r.total)}</td>
                  </tr>
                ))}
                <tr className="font-bold text-ink">
                  <td className="py-1.5 pr-3">Total</td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums">{usd0(grant.budget_by_milestone.m1)}</td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums">{usd0(grant.budget_by_milestone.m2)}</td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums">{usd0(grant.budget_by_milestone.m3)}</td>
                  <td className="py-1.5 pl-3 text-right font-mono tabular-nums" style={{ color: UP }}>
                    {usd0(grant.budget_total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* 6 · Honesty sheet */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card tier="detail" label="What we claim">
            <ul className="space-y-1.5">
              {grant.claims.map((c) => (
                <li key={c} className="flex gap-2 text-[13px] leading-snug text-sub">
                  <span style={{ color: UP }}>✓</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card tier="detail" label="What we do NOT claim">
            <ul className="space-y-1.5">
              {grant.does_not_claim.map((c) => (
                <li key={c} className="flex gap-2 text-[13px] leading-snug text-sub">
                  <span style={{ color: DOWN }}>✗</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* 7 · We corrected our own number — the credibility asset, read live from facts.json */}
        <Card tier="supporting" accent="#d9a23a" className="mt-4" label="We corrected our own number — downward">
          <p className="text-[13.5px] leading-relaxed text-sub">{grant.self_correction.context}</p>
          {corrected > 0 && (
            <p className="mt-2 font-mono text-[12px]">
              earlier draft <span style={{ color: MUTED }}>{usd0(grant.self_correction.earlier_usd)}</span> · measured
              on-chain{" "}
              <span className="font-bold" style={{ color: DOWN }}>
                {usd0(corrected)}
              </span>
              {foldMultiple ? ` · ~${foldMultiple}× thinner` : ""}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              window.setTimeout(() => traceClaim(grant.self_correction.claim_key), 120);
            }}
            className="mt-3 rounded-sm border border-edge px-2 py-0.5 font-mono text-[10px] text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            trace → the evidence
          </button>
        </Card>

        {/* 8 · How we measure + links */}
        <Card tier="supporting" className="mt-4" label="How we measure">
          <ul className="space-y-2 text-[13px] leading-relaxed text-sub">
            <li>
              Reserves read <span className="text-ink">on-chain</span> via Hiro <code className="font-mono text-ink">call-read</code>; AMM
              quotes come from each pool's own <code className="font-mono text-ink">get-dy</code>/<code className="font-mono text-ink">get-y</code> — so
              slippage is what the contract would actually charge, not a constant-product guess.
            </li>
            <li>Each pool gives a slippage ladder; we read off how much clears at ≤2% — that's the depth.</li>
            <li>
              An asset counts as tradeable only if it absorbs ≥{usd0(v.thresholds.min_asset_depth_2pct_usd)} at ≤2%;
              a rotation needs ≥{v.thresholds.min_independent_assets} independent tradeable assets.{" "}
              <span className="text-ink">{v.n_tradeable_assets} clear today.</span>
            </li>
            <li>
              Chain is the source of truth; vendor APIs (ALEX / Velar / DexScreener) only cross-check, and every number
              regenerates bit-for-bit from the committed dataset.
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-edge pt-3 font-mono text-[12px]">
            <a href={grant.repo_url} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
              Source &amp; dataset (GitHub) ↗
            </a>
            <span className="text-muted">·</span>
            <span className="text-muted">MIT · no custody, no funds · chain is source of truth</span>
          </div>
        </Card>

        {/* footer nav */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onClose} className={backBtn}>
            ← Back to dashboard
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border-3 border-brand/50 bg-brand/10 px-3.5 py-2 font-display text-[13px] font-bold text-brand shadow-brut-sm transition hover:-translate-y-0.5 hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            Explore the depth →
          </button>
        </div>
      </main>
    </div>
  );
}
