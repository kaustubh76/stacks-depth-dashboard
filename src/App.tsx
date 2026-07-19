import { useEffect, useState } from "react";

import { bakedData, fetchLive } from "./api/data";
import type { StacksData } from "./api/types";
import Collapsible from "./components/ui/Collapsible";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import Masthead from "./components/panels/Masthead";
import VerdictBanner from "./components/panels/VerdictBanner";
import HeadlineTiles from "./components/panels/HeadlineTiles";
import SlippageCurves from "./components/panels/SlippageCurves";
import MovableByThreshold from "./components/panels/MovableByThreshold";
import AssetDepthTable from "./components/panels/AssetDepthTable";
import DataQualityPanel from "./components/panels/DataQualityPanel";
import VenuesBreakdown from "./components/panels/VenuesBreakdown";
import RotationBacktest from "./components/panels/RotationBacktest";
import Provenance from "./components/panels/Provenance";
import Footer from "./components/panels/Footer";

/** Wrap each panel so one bad field can never white-screen the page. */
function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return <ErrorBoundary label={label}>{children}</ErrorBoundary>;
}

export default function App() {
  const [data, setData] = useState<StacksData>(() => bakedData());

  // Upgrade to live data if a same-origin FastAPI backend answers; otherwise the
  // baked snapshot stands. No-op on a plain static host.
  useEffect(() => {
    const ac = new AbortController();
    fetchLive(ac.signal).then((live) => {
      if (live) setData(live);
    });
    return () => ac.abort();
  }, []);

  const { summary, study, facts, ladders, live } = data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Masthead asOf={summary.as_of_date} live={live} />

      <Panel label="Verdict">
        <VerdictBanner verdict={study.verdict} />
      </Panel>

      <Panel label="Headline">
        <HeadlineTiles summary={summary} verdict={study.verdict} />
      </Panel>

      <div className="mb-4">
        <Panel label="Slippage curves">
          <SlippageCurves ladders={ladders} />
        </Panel>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel label="Movable by threshold">
          <MovableByThreshold depth={study.depth_index} />
        </Panel>
        <Panel label="Asset depth">
          <AssetDepthTable byAsset={study.depth_index.by_asset} verdict={study.verdict} />
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

      <Collapsible title="Proof & methodology" id="proof" className="mt-6">
        <div className="flex flex-col gap-4">
          <Panel label="Rotation backtest">
            <RotationBacktest audit={study.audit} />
          </Panel>
          <Panel label="Provenance">
            <Provenance facts={facts} />
          </Panel>
        </div>
      </Collapsible>

      <Footer summary={summary} />
    </div>
  );
}
