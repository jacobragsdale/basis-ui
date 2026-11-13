/* A view of the tickers that hands the engine's reduction of its chart, and the view, to the test that renders it. */

import { useEffect } from "react";
import type { ReactNode } from "react";

import type { ViewHandle } from "#engine/view.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { useDataset } from "#react/use-dataset.ts";
import { useView } from "#react/use-view.ts";

import { plot, tickerBytes } from "./ticker-data.ts";

/** A reduction and the view it is of. */
interface Reduced {
  readonly frame: ChartFrameData;
  readonly handle: ViewHandle;
}

/** Opens `layout` over the tickers and hands each reduction to `onReduced`. */
function Reduction({
  layout,
  onReduced,
}: {
  readonly layout: LayoutInput;
  readonly onReduced: (reduced: Reduced) => void;
}): ReactNode {
  const dataset = useDataset("tickers", tickerBytes);
  const view = useView(dataset, layout, { chartWindow: plot, viewport: null });
  useEffect(() => {
    if (view.chart !== null && view.handle !== null) {
      onReduced({ frame: view.chart, handle: view.handle });
    }
  }, [view.chart, view.handle, onReduced]);
  return null;
}

export { Reduction };
export type { Reduced };
