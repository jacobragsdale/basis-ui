import "@basis/ui/styles.css";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { Chart } from "#chart/chart.tsx";
import type { Layout, LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { deskExposures, exposures, yields } from "./chart-data.ts";
import { fire, plotOf, rest, summaryOf, surfaceOf, wordsOf } from "./chart-reads.ts";
import { PricesChart } from "./charts.tsx";
import { startWorker } from "./data.ts";

const candles = {
  chart: {
    kind: "candlestick",
    ohlc: { close: "close", high: "high", low: "low", open: "open" },
    x: "date",
  },
} satisfies LayoutInput;
const line = { chart: { kind: "line", x: "date", y: ["close"] } } satisfies LayoutInput;

/** Renders a line chart of the prices, counting React's renders of it, once it has drawn and settled. */
async function countedLine(): Promise<{
  readonly root: HTMLElement;
  readonly renders: () => number;
}> {
  let renders = 0;
  const screen = await render(
    <ParallaxProvider worker={startWorker}>
      <PricesChart
        layout={line}
        onRender={() => {
          renders += 1;
        }}
      />
    </ParallaxProvider>,
  );
  await expect.poll(() => summaryOf(screen.container)).toMatch(/points drawn$/u);
  // Whatever React rendered while the chart loaded and laid itself out is done.
  await rest(300);
  return { renders: () => renders, root: screen.container };
}

/** Moves the pointer across the plot, a few pixels a step. */
function sweep(root: HTMLElement): void {
  for (let x = 100; x < 500; x += 4) {
    fire(root, "pointermove", { x, y: 120 });
  }
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("Chart's small-data form", () => {
  test("draws rows the page holds as a bar chart, in the rows' order, with a text alternative", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart rows={exposures} kind="bar" x="sector" y="exposure" className="h-80 w-160" />
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container)).toBe("3 groups");
    await expect
      .element(screen.getByRole("application"))
      .toHaveAccessibleName("Bar chart of sector from rows");
    const words = wordsOf(screen.container);
    // The groups in the rows' order, not the engine's alphabetical one.
    const order = ["Rates", "Credit", "Agency"].map((sector) => words.indexOf(`${sector}:`));
    expect(order).toStrictEqual(order.toSorted((first, second) => first - second));
    expect(order.every((at) => at >= 0)).toBe(true);
  });

  test("reads dates written as text, and draws a line of them", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart rows={yields} kind="line" x="date" y="yield" className="h-80 w-160" />
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container)).toBe("5 points drawn");
    expect(wordsOf(screen.container)).toMatch(
      /yield: from 4\.1\d* at 2026-11-02 to 4\.25\d* at 2026-11-06/u,
    );
  });

  test("hides a series from its legend, and tells the page", async () => {
    const changes: Layout[] = [];
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart
          rows={deskExposures}
          kind="bar"
          x="sector"
          y="exposure"
          series="desk"
          onLayoutChange={(layout) => {
            changes.push(layout);
          }}
          className="h-80 w-160"
        />
      </ParallaxProvider>,
    );
    const legend = screen.getByRole("group", { name: "Series" }).getByRole("button");
    await expect.element(legend.first()).toHaveAttribute("aria-pressed", "true");
    expect(legend.elements()).toHaveLength(2);
    await legend.first().click();
    await expect.element(legend.first()).toHaveAttribute("aria-pressed", "false");
    expect(changes.at(-1)?.chart?.hidden).toStrictEqual([legend.elements()[0]?.textContent]);
  });
});

describe("Chart over a dataset", () => {
  test("opens below the page that loads its data, and says what it draws", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <PricesChart layout={candles} />
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container)).toMatch(/candles$/u);
    await expect
      .element(screen.getByRole("application"))
      .toHaveAccessibleName("Candlestick chart of date from prices");
    expect(wordsOf(screen.container)).toMatch(/Week of 2024-12-30: opens at [\d.]+/u);
  });

  test("follows the pointer without rendering", async () => {
    const { root, renders } = await countedLine();
    const settled = renders();
    sweep(root);
    await vi.waitFor(() => {
      expect(root.querySelector('[role="tooltip"]')?.hasAttribute("hidden")).toBe(false);
    });
    expect(root.querySelectorAll('[data-slot="chart-tip-row"]')).toHaveLength(1);
    expect(renders()).toBe(settled);
  });

  test("zooms with the wheel, rendering once, when the wheel rests and the layout records the zoom", async () => {
    const { root, renders } = await countedLine();
    const settled = renders();
    for (let step = 0; step < 10; step += 1) {
      fire(root, "wheel", { deltaY: -100, x: 300, y: 120 });
    }
    await expect.poll(() => summaryOf(root)).toContain("zoomed in");
    await rest(600);
    expect(renders() - settled).toBeLessThanOrEqual(1);
  });

  test("repaints in the page's mode when it changes", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <PricesChart layout={line} />
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container)).toMatch(/points drawn$/u);
    const light = surfaceOf(screen.container);
    document.documentElement.classList.add("dark");
    await expect.poll(() => surfaceOf(screen.container)).not.toBe(light);
  });

  test("says what is wrong with a layout it cannot draw", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <PricesChart layout={{ ...line, expand_depth: -1 }} />
      </ParallaxProvider>,
    );
    await expect.element(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByRole("alert").element().textContent).toMatch(/^Invalid layout: /u);
    expect(plotOf(screen.container).getAttribute("aria-label")).toBe("Chart");
  });
});
