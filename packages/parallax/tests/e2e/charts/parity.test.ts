/* The React chart's canvas against the Angular demo's screenshots: drawn in parallax's standard theme with the Angular
 * layer's chart colours (`?look=angular`), at the Angular canvas's size, over the same data, every chart whose renderer
 * and inputs are unchanged matches its Angular screenshot pixel for pixel. The charts that cannot are listed, each with
 * its reason. Runs only in the pinned Playwright image, the Angular screenshots' own. */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { inTurn } from "./gestures.ts";
import { chartCount, open } from "./pages.ts";
import { compared } from "./parity.ts";
import type { Comparison } from "./parity.ts";

test.skip(
  process.env["PARALLAX_PINNED_IMAGE"] !== "1",
  "The Angular screenshots are compared only in the pinned Playwright image: run node tests/e2e/charts/run.ts parity.",
);

/**
 * The charts whose canvas cannot match the Angular screenshot's, and why. Their axes, labels and every other pixel
 * outside their cells match; the comparison above says where the differing pixels lie.
 */
const differences: Readonly<Record<string, string>> = {
  density:
    "Its cells take the sequential scale, which has 9 steps in @basis/parallax, as @basis/ui's has, where the Angular layer's had 7 (roadmap step 2.5), so a cell's count falls on another step.",
  heatmap:
    "Its cells take the sequential scale and the diverging scale's red arm, which have 9 and 5 steps in @basis/parallax, as @basis/ui's do, where the Angular layer's had 7 each (roadmap step 2.5).",
};

/** A page of charts: where it is, its sections, and each section's name among the Angular screenshots. */
interface ChartsPage {
  readonly path: string;
  readonly count: number;
  readonly sections: string;
  readonly attribute: string | null;
  readonly prefix: string;
}

const pages: readonly ChartsPage[] = [
  {
    attribute: "data-card",
    count: chartCount,
    path: "charts",
    prefix: "",
    sections: "section[data-card]",
  },
  {
    attribute: "data-breakdown",
    count: 10,
    path: "breakdowns",
    prefix: "breakdown-",
    sections: "section[data-breakdown]",
  },
  {
    attribute: null,
    count: 1,
    path: "technical",
    prefix: "technical-page",
    sections: '[data-slot="technical-chart"]',
  },
];

/** Compares every chart of a page with its Angular screenshot in `theme`. */
async function comparePage(
  page: Page,
  { charts, theme }: { readonly charts: ChartsPage; readonly theme: string },
): Promise<Readonly<Record<string, Comparison>>> {
  await open(page, `/?page=${charts.path}&theme=${theme}&look=angular`, charts.count);
  await page.mouse.move(0, 0);
  const results: Record<string, Comparison> = {};
  await inTurn(await page.locator(charts.sections).all(), async (section) => {
    const id =
      charts.attribute === null ? "" : ((await section.getAttribute(charts.attribute)) ?? "");
    const name = `${charts.prefix}${id}`;
    results[name] = await compared(section, { name, theme });
  });
  return results;
}

for (const theme of ["light", "dark"] as const) {
  for (const charts of pages) {
    test(`the ${charts.path} page's canvases match the Angular screenshots, ${theme} mode`, async ({
      page,
    }, info) => {
      const results = await comparePage(page, { charts, theme });
      mkdirSync(info.outputDir, { recursive: true });
      writeFileSync(path.join(info.outputDir, "parity.json"), JSON.stringify(results, null, 1));
      const matched = Object.entries(results).map(
        ([name, result]) => [name, result.differing === 0] as const,
      );
      expect(Object.fromEntries(matched)).toStrictEqual(
        Object.fromEntries(matched.map(([name]) => [name, differences[name] === undefined])),
      );
    });
  }
}
