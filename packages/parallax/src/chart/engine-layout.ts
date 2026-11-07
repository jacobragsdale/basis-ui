/* The layout a chart's view sends the engine: what the engine computes from, without what only changes the drawing,
 * so hiding a series, a log scale or a recorded zoom sends nothing (the zoom goes as the chart window instead). */

import type { Layout } from "#layout/layout.ts";

import { withPieLimit } from "./source.ts";

/** The layout as the engine computes the chart from it; its JSON is `computedPart`'s. */
function engineLayout(layout: Layout): Layout {
  const limited = withPieLimit(layout) ?? layout;
  const chart =
    limited.chart === null
      ? null
      : {
          ...limited.chart,
          hidden: [],
          horizontal: false,
          log_y: false,
          range: null,
          stacked: false,
        };
  return { ...limited, chart, column_widths: {} };
}

export { engineLayout };
