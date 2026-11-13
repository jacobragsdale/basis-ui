import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { Chart } from "#chart/chart.tsx";
import type { ChartRow } from "#chart/small-table.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { summaryOf, wordsOf } from "./chart-reads.ts";
import { startWorker } from "./data.ts";

/** Two years of business days, past the 500 rows a grouped chart once read. */
const twoYears = 504;
/** How long a chart may take to draw first: the engine's worker starts with it, which a busy host slows. */
const firstDraw = { timeout: 20_000 } as const;
/** Past the most groups a grouped chart draws. */
const tooMany = 2100;

/** `count` days of P&L, each its own group, a day's P&L its number. */
function dailyPnl(count: number): readonly ChartRow[] {
  return Array.from({ length: count }, (_entry, day) => ({
    day: `D${String(day + 1).padStart(4, "0")}`,
    pnl: (day % 7) - 3,
  }));
}

describe("a chart of the layout's grouped view", () => {
  test("draws every group, the newest days included", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart rows={dailyPnl(twoYears)} kind="bar" x="day" y="pnl" className="h-80 w-160" />
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container), firstDraw).toBe("504 groups");
  });

  test("runs a waterfall through every group to its total", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart rows={dailyPnl(twoYears)} kind="waterfall" x="day" y="pnl" className="h-80 w-160" />
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container), firstDraw).toBe("504 groups");
    expect(wordsOf(screen.container)).not.toMatch(/don't reach its total/u);
  });

  test("past the most groups it draws, says so and what to change, rather than draw some", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart rows={dailyPnl(tooMany)} kind="bar" x="day" y="pnl" className="h-80 w-160" />
      </ParallaxProvider>,
    );
    await expect
      .poll(() => summaryOf(screen.container), firstDraw)
      .toBe(
        "A bar chart draws at most 2,000 groups, and this one has more: filter its rows, group it by a coarser column, or keep the largest with top_n",
      );
    expect(wordsOf(screen.container)).not.toMatch(/D0001:/u);
  });
});
