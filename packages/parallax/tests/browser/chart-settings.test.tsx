import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { Chart } from "#chart/chart.tsx";
import { ParallaxProvider } from "#react/provider.tsx";

import { exposures } from "./chart-data.ts";
import { startWorker } from "./data.ts";

/** How long a chart may take to say what is wrong: the engine's worker starts with it, which a busy host slows. */
const firstDraw = { timeout: 20_000 } as const;

/** The problem a chart shows in place of its plot. */
function alertOf(root: HTMLElement): string {
  return root.querySelector('[role="alert"]')?.textContent ?? "";
}

describe("Chart's settings its kind does not draw", () => {
  test("says a stacked area does not stack, rather than draw it overlapping", async () => {
    const rows = [
      { desk: "a", day: "2026-11-10", pnl: 60 },
      { desk: "b", day: "2026-11-10", pnl: 40 },
    ];
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart
          rows={rows}
          kind="area"
          x="day"
          y="pnl"
          series="desk"
          settings={{ stacked: true }}
          className="h-80 w-160"
        />
      </ParallaxProvider>,
    );
    await expect
      .poll(() => alertOf(screen.container), firstDraw)
      .toBe(
        "An area chart does not stack its series: only a bar chart does, so set stacked to false, or draw them as stacked bars.",
      );
  });

  test("says a bar chart has one value axis, rather than drop its right one", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart
          rows={exposures}
          kind="bar"
          x="sector"
          y="exposure"
          settings={{ y_right: ["exposure"] }}
          className="h-80 w-160"
        />
      </ParallaxProvider>,
    );
    await expect
      .poll(() => alertOf(screen.container), firstDraw)
      .toMatch(/^A bar chart has one value axis/u);
  });
});
