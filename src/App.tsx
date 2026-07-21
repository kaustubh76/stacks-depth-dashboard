import { useCallback, useEffect, useState } from "react";

import { bakedData } from "./api/data";
import { useScenario } from "./hooks/useHashState";
import { useLiveData } from "./hooks/useLiveData";
import { flashSection, sectionId } from "./lib/sections";
import { FOCUS_PLANNER_EVENT } from "./lib/cockpit";
import { usd0 } from "./lib/format";
import { buildScenario, downloadText, poolsCsv, scenarioJson, scenarioSummary } from "./lib/export";
import { usePoolSelection } from "./hooks/usePoolSelection";
import TradePlanner from "./components/panels/TradePlanner";
import PoolBrowser from "./components/panels/PoolBrowser";
import PoolCompare from "./components/panels/PoolCompare";
import { ChipButton } from "./components/ui/ChipButton";
import { useToast } from "./components/ui/Toast";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import StickyHeader, { type NavSection } from "./components/StickyHeader";
import SectionBand from "./components/SectionBand";
import TradePlanPage from "./components/TradePlanPage";
import PoolDetailPage from "./components/PoolDetailPage";
import CommandPalette from "./components/cockpit/CommandPalette";
import KeyboardLayer from "./components/cockpit/KeyboardLayer";
import Cheatsheet from "./components/cockpit/Cheatsheet";
import Tour from "./components/cockpit/Tour";
import Masthead from "./components/panels/Masthead";
import LiveCrossCheck from "./components/panels/LiveCrossCheck";
import LiveDepthDrift from "./components/panels/LiveDepthDrift";
import VerdictBanner from "./components/panels/VerdictBanner";
import HeadlineTiles from "./components/panels/HeadlineTiles";
import SlippageBudget from "./components/panels/SlippageBudget";
import ScenarioPresets from "./components/panels/ScenarioPresets";
import SlippageExplorer from "./components/panels/SlippageExplorer";
import DepthCalculator from "./components/panels/DepthCalculator";
import MovableByThreshold from "./components/panels/MovableByThreshold";
import AssetDepthTable from "./components/panels/AssetDepthTable";
import DataQualityPanel from "./components/panels/DataQualityPanel";
import VenuesBreakdown from "./components/panels/VenuesBreakdown";
import RotationBacktest from "./components/panels/RotationBacktest";
import Provenance from "./components/panels/Provenance";
import Footer from "./components/panels/Footer";

/** Section-id contract: stamps the id + data-section-label the cockpit nav/palette/tour
 * discover from the DOM, with scroll-mt so the flash target clears the sticky header. */
function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div id={sectionId(label)} data-section-label={label} className="scroll-mt-28">
      <ErrorBoundary label={label}>{children}</ErrorBoundary>
    </div>
  );
}

/** The 4-section information architecture (band titles must match the SectionBand titles below). */
const SECTIONS: NavSection[] = [
  { label: "Overview", short: "Overview" },
  { label: "Plan a trade", short: "Plan" },
  { label: "Explore the pools", short: "Pools" },
  { label: "The evidence", short: "Evidence" },
];

export default function App() {
  const data = bakedData();
  const { summary, study, ladders } = data;
  const { budget, setBudget, moveX, setMoveX, asset, setAsset, view, pool, openPlan, openPool, closePlan, goDashboard, shareLink } = useScenario();

  const [liveEnabled, setLiveEnabled] = useState(true);
  const { live, refresh } = useLiveData(liveEnabled);
  const selection = usePoolSelection();
  const { toast } = useToast();

  const copyLink = useCallback(() => {
    try {
      void navigator.clipboard?.writeText(shareLink());
    } catch {
      /* clipboard blocked — hash is still in the address bar */
    }
  }, [shareLink]);

  /** The current scenario as a copyable one-paragraph blurb (planner + presets share it). */
  const planSummary = useCallback(
    () => scenarioSummary(buildScenario(ladders, summary, study, budget, moveX, asset), shareLink()),
    [ladders, summary, study, budget, moveX, asset, shareLink],
  );

  // Export actions — shared by the Pool browser header and the ⌘K palette.
  const downloadCsv = useCallback(() => {
    downloadText(
      `stacks-depth-pools-${summary.as_of_date}-at-${(budget * 100).toFixed(2)}pct.csv`,
      "text/csv",
      poolsCsv(ladders, budget),
    );
  }, [ladders, summary, budget]);

  const downloadScenarioJson = useCallback(() => {
    downloadText(
      `stacks-depth-scenario-${summary.as_of_date}.json`,
      "application/json",
      scenarioJson(buildScenario(ladders, summary, study, budget, moveX, asset)),
    );
  }, [ladders, summary, study, budget, moveX, asset]);

  const copySummary = useCallback(() => {
    try {
      void navigator.clipboard?.writeText(planSummary());
      toast.success("Scenario summary copied");
    } catch {
      toast.warn("Clipboard unavailable — use the share link instead");
    }
  }, [planSummary, toast]);

  // Self-demonstrating intro: ~1s after load, gently sweep the budget once so the whole page
  // visibly reacts (movable figure, verdict, bars, table) — proving it's interactive. Aborts on
  // the first user input; skipped under reduced-motion or when arriving on a deep-linked budget.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || Math.abs(budget - 0.02) > 1e-6) return; // don't override a shared/deep-linked view
    let raf = 0;
    let start = 0;
    let done = false;
    const DUR = 1500;
    const LO = 0.02;
    const HI = 0.038;
    const cleanup = () => {
      window.removeEventListener("pointerdown", abort);
      window.removeEventListener("keydown", abort);
    };
    function abort() {
      done = true;
      cancelAnimationFrame(raf);
      cleanup();
      setBudget(0.02);
    }
    const step = (t: number) => {
      if (done) return;
      if (!start) start = t;
      const p = Math.min((t - start) / DUR, 1);
      setBudget(LO + (HI - LO) * Math.sin(p * Math.PI)); // out-and-back
      if (p < 1) raf = requestAnimationFrame(step);
      else { setBudget(0.02); cleanup(); }
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", abort, { once: true });
      window.addEventListener("keydown", abort, { once: true });
      raf = requestAnimationFrame(step);
    }, 950);
    return () => {
      done = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Trade Plan page is a full-screen route (deep-linked via #v=plan) — render it instead of
  // the dashboard when active. All hooks above run unconditionally; this switch is after them.
  if (view === "plan") {
    return (
      <TradePlanPage
        ladders={ladders}
        budget={budget}
        setBudget={setBudget}
        moveX={moveX}
        setMoveX={setMoveX}
        asset={asset}
        setAsset={setAsset}
        onClose={closePlan}
        planSummary={planSummary}
        shareLink={shareLink}
        onDownloadJson={downloadScenarioJson}
      />
    );
  }

  if (view === "pool" && pool) {
    return (
      <PoolDetailPage
        ladders={ladders}
        live={live}
        budget={budget}
        moveX={moveX}
        setAsset={setAsset}
        poolKeyStr={pool}
        selection={selection}
        onOpenPlan={openPlan}
        onClose={goDashboard}
        shareLink={shareLink}
      />
    );
  }

  return (
    <>
      <StickyHeader
        movableText={usd0(study.verdict.movable_at_2pct_usd)}
        live={live.anyLive}
        liveEnabled={liveEnabled}
        onToggleLive={() => setLiveEnabled((v) => !v)}
        sections={SECTIONS}
      />

      {/* Cockpit overlays — self-wire via the window-event bus */}
      <CommandPalette
        actions={{
          refreshLive: refresh,
          copyLink,
          downloadCsv,
          planTrade: () => {
            openPlan();
            window.dispatchEvent(new Event(FOCUS_PLANNER_EVENT));
          },
          comparePools: () => flashSection(sectionId("Pool compare")),
        }}
      />
      <KeyboardLayer onRefreshLive={refresh} />
      <Cheatsheet />
      <Tour />

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Masthead asOf={summary.as_of_date} live={false} />

        {/* Hero strip — the answer at a glance + the primary path */}
        <div className="mb-6 flex flex-col gap-3 rounded-sm border-3 border-[color:var(--thick-line)] bg-panel2/40 p-4 shadow-brut-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="font-mono text-[13px] leading-relaxed text-sub">
            <b className="text-brand">{usd0(study.verdict.movable_at_2pct_usd)}</b> moves at ≤2% ·{" "}
            <b className="text-ink">
              {study.verdict.n_tradeable_assets}/{study.verdict.thresholds.min_independent_assets}
            </b>{" "}
            assets tradeable ·{" "}
            <span style={{ color: study.verdict.rotation_viable ? "#43b581" : "#e0728a" }}>
              {study.verdict.rotation_viable ? "systematic trading viable" : "not yet viable"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => flashSection(sectionId("Plan a trade"))}
              className="rounded-sm border-3 border-brand/50 bg-brand/10 px-3 py-1.5 font-display text-[12px] font-bold text-brand shadow-brut-sm transition hover:bg-brand/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              Plan a trade →
            </button>
            <button
              type="button"
              onClick={() => flashSection(sectionId("The evidence"))}
              className="rounded-sm border border-edge px-3 py-1.5 font-mono text-[11px] text-muted transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              See the evidence
            </button>
          </div>
        </div>

        <SectionBand title="Overview" summary="the finding, and live conditions right now">
          <Panel label="Verdict">
            <VerdictBanner verdict={study.verdict} ladders={ladders} budget={budget} />
          </Panel>
          <Panel label="Headline">
            <HeadlineTiles summary={summary} verdict={study.verdict} />
          </Panel>
          <Panel label="Live cross-check">
            <LiveCrossCheck live={live} snapshotCleanVol={summary.volume_24h_usd_clean} enabled={liveEnabled} onToggle={() => setLiveEnabled((v) => !v)} />
          </Panel>
          <Panel label="Live depth drift">
            <LiveDepthDrift live={live} ladders={ladders} snapshotMovable={study.verdict.movable_at_2pct_usd} onOpenPool={openPool} />
          </Panel>
        </SectionBand>

        {/* Master control — always visible, drives the Plan + Pools sections */}
        <div className="sticky top-12 z-30 mb-6">
          <Panel label="Slippage budget">
            <SlippageBudget ladders={ladders} thresholds={study.verdict.thresholds} budget={budget} setBudget={setBudget} />
          </Panel>
        </div>

        <SectionBand title="Plan a trade" summary="size a trade, explore slippage, run what-ifs">
          <Panel label="Scenarios">
            <ScenarioPresets
              budget={budget}
              moveX={moveX}
              setBudget={setBudget}
              setMoveX={setMoveX}
              actions={
                <span className="flex items-center gap-1.5">
                  <ChipButton onClick={copySummary} title="copy a one-paragraph summary of the current scenario" ariaLabel="Copy scenario summary">
                    copy summary
                  </ChipButton>
                  <ChipButton onClick={downloadScenarioJson} title="download the current scenario as JSON" ariaLabel="Download scenario JSON">
                    ⬇ .json
                  </ChipButton>
                </span>
              }
            />
          </Panel>
          <Panel label="Trade planner">
            <TradePlanner
              ladders={ladders}
              budget={budget}
              moveX={moveX}
              setMoveX={setMoveX}
              asset={asset}
              setAsset={setAsset}
              onOpenPlan={openPlan}
            />
          </Panel>
          <Panel label="Slippage explorer">
            <SlippageExplorer
              ladders={ladders}
              moveX={moveX}
              setMoveX={setMoveX}
              budget={budget}
              focus={selection.focusKey}
              onClearFocus={() => selection.setFocus(null)}
            />
          </Panel>
          <Panel label="Depth calculator">
            <DepthCalculator ladders={ladders} moveX={moveX} setMoveX={setMoveX} budget={budget} />
          </Panel>
        </SectionBand>

        <SectionBand title="Explore the pools" summary="every measured pool, compared, at your budget">
          <Panel label="Pool browser">
            <PoolBrowser
              ladders={ladders}
              budget={budget}
              selection={selection}
              onOpenPool={openPool}
              onDownloadCsv={downloadCsv}
              onDownloadJson={downloadScenarioJson}
            />
          </Panel>
          <Panel label="Pool compare">
            <PoolCompare ladders={ladders} budget={budget} moveX={moveX} selection={selection} />
          </Panel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel label="Movable by budget">
              <MovableByThreshold depth={study.depth_index} ladders={ladders} budget={budget} setBudget={setBudget} />
            </Panel>
            <Panel label="Asset depth">
              <AssetDepthTable byAsset={study.depth_index.by_asset} verdict={study.verdict} ladders={ladders} budget={budget} />
            </Panel>
          </div>
        </SectionBand>

        <SectionBand title="The evidence" summary="data quality, venues, backtest, provenance" defaultOpen={false}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel label="Data quality">
              <DataQualityPanel summary={summary} />
            </Panel>
            <Panel label="Venues">
              <VenuesBreakdown summary={summary} />
            </Panel>
          </div>
          <Panel label="Rotation backtest">
            <RotationBacktest audit={study.audit} budget={budget} />
          </Panel>
          <Panel label="Provenance">
            <Provenance facts={data.facts} />
          </Panel>
        </SectionBand>

        <Footer summary={summary} />
      </div>
    </>
  );
}
