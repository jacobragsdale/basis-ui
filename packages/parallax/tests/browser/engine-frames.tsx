/* Chart frames as the engine makes them, for tests of what the chart's TypeScript does with them: the first reduction
 * of a layout over the tickers, with the view it is of, which measures. */

import { render } from "vitest-browser-react";

import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { startWorker } from "./data.ts";
import { Reduction } from "./reduction.ts";
import type { Reduced } from "./reduction.ts";

/** The engine's first reduction of `layout` over the tickers, and its view. */
async function reduced(layout: LayoutInput): Promise<Reduced> {
  const { promise, resolve } = Promise.withResolvers<Reduced>();
  await render(
    <ParallaxProvider worker={startWorker}>
      <Reduction layout={layout} onReduced={resolve} />
    </ParallaxProvider>,
  );
  return promise;
}

export { reduced };
