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
import StickyHeader from "./components/StickyHeader";
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
    <div id={sectionId(label)} data-section-label={label} className="scroll-mt-20">
      <ErrorBoundary label={label}>{children}</ErrorBoundary>
    </div>
  );
}

export default function App() {
  const data = bakedData();
  const { summary, study, ladders } = data;
  const { budget, setBudget, moveX, setMoveX, asset, setAsset, shareLink } = useScenario();

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

  return (
    <>
      <StickyHeader
        movableText={usd0(study.verdict.movable_at_2pct_usd)}
        live={live.anyLive}
        liveEnabled={liveEnabled}
        onToggleLive={() => setLiveEnabled((v) => !v)}
      />

      {/* Cockpit overlays — self-wire via the window-event bus */}
      <CommandPalette
        actions={{
          refreshLive: refresh,
          copyLink,
          downloadCsv,
          planTrade: () => {
            flashSection(sectionId("Trade planner"));
            window.dispatchEvent(new Event(FOCUS_PLANNER_EVENT));
          },
          comparePools: () => flashSection(sectionId("Pool compare")),
        }}
      />
      <KeyboardLayer onRefreshLive={refresh} />
      <Cheatsheet />
      <Tour />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Masthead asOf={summary.as_of_date} live={false} />

        <div className="mb-4">
          <Panel label="Live cross-check">
            <LiveCrossCheck live={live} snapshotCleanVol={summary.volume_24h_usd_clean} enabled={liveEnabled} onToggle={() => setLiveEnabled((v) => !v)} />
          </Panel>
        </div>

        <div className="mb-5">
          <Panel label="Live depth drift">
            <LiveDepthDrift live={live} ladders={ladders} snapshotMovable={study.verdict.movable_at_2pct_usd} />
          </Panel>
        </div>

        <Panel label="Verdict">
          <VerdictBanner verdict={study.verdict} ladders={ladders} budget={budget} />
        </Panel>

        <Panel label="Headline">
          <HeadlineTiles summary={summary} verdict={study.verdict} />
        </Panel>

        {/* Interactive core */}
        <div className="sticky top-12 z-30">
          <Panel label="Slippage budget">
            <SlippageBudget ladders={ladders} thresholds={study.verdict.thresholds} budget={budget} setBudget={setBudget} />
          </Panel>
        </div>

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

        <div className="mb-4">
          <Panel label="Trade planner">
            <TradePlanner
              ladders={ladders}
              budget={budget}
              moveX={moveX}
              setMoveX={setMoveX}
              asset={asset}
              setAsset={setAsset}
              planSummary={planSummary}
            />
          </Panel>
        </div>

        <div className="mb-4">
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
        </div>

        <div className="mb-4">
          <Panel label="Depth calculator">
            <DepthCalculator ladders={ladders} moveX={moveX} setMoveX={setMoveX} budget={budget} />
          </Panel>
        </div>

        <div className="mb-4">
          <Panel label="Pool browser">
            <PoolBrowser
              ladders={ladders}
              budget={budget}
              selection={selection}
              onDownloadCsv={downloadCsv}
              onDownloadJson={downloadScenarioJson}
            />
          </Panel>
        </div>

        <div className="mb-4">
          <Panel label="Pool compare">
            <PoolCompare ladders={ladders} budget={budget} moveX={moveX} selection={selection} />
          </Panel>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel label="Movable by budget">
            <MovableByThreshold depth={study.depth_index} ladders={ladders} budget={budget} setBudget={setBudget} />
          </Panel>
          <Panel label="Asset depth">
            <AssetDepthTable byAsset={study.depth_index.by_asset} verdict={study.verdict} ladders={ladders} budget={budget} />
          </Panel>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel label="Data quality">
            <DataQualityPanel summary={summary} />
          </Panel>
          <Panel label="Venues">
            <VenuesBreakdown summary={summary} />
          </Panel>
        </div>

        <div className="mb-4">
          <Panel label="Rotation backtest">
            <RotationBacktest audit={study.audit} budget={budget} />
          </Panel>
        </div>

        <Panel label="Provenance">
          <Provenance facts={data.facts} />
        </Panel>

        <Footer summary={summary} />
      </div>
    </>
  );
}
