/* A chart's pan and zoom before the engine answers: the picture moves at once, and the answer then draws the chart. */

import "@basis/ui/styles.css";

import { expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { fire, rest, summaryOf } from "./chart-reads.ts";
import { PricesChart } from "./charts.tsx";
import { gatedWorker } from "./gated-worker.ts";
import type { GatedWorker } from "./gated-worker.ts";

const line = { chart: { kind: "line", x: "date", y: ["close"] } } satisfies LayoutInput;

/** Renders a line chart of the prices on a worker whose answers the test can hold, once it has drawn and settled. */
async function gatedLine(): Promise<{
  readonly container: HTMLElement;
  readonly gate: GatedWorker;
}> {
  const gate = gatedWorker();
  const { container } = await render(
    <ParallaxProvider worker={gate.start}>
      <PricesChart layout={line} />
    </ParallaxProvider>,
  );
  await expect.poll(() => summaryOf(container)).toMatch(/points drawn$/u);
  await rest(300);
  return { container, gate };
}

/** The chart's canvas, as an image. */
function pictureOf(root: HTMLElement): string {
  return root.querySelector("canvas")?.toDataURL() ?? "";
}

test("moves the picture at once when it zooms, before the engine answers, then draws the answer", async () => {
  const { container, gate } = await gatedLine();
  const before = pictureOf(container);
  gate.close();
  fire(container, "wheel", { deltaY: -100, x: 300, y: 120 });
  await rest(100);
  expect(pictureOf(container)).not.toBe(before);
  gate.open();
  await expect.poll(() => summaryOf(container)).toContain("zoomed in");
});
