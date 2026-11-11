/* Every page of the demo, in light and dark at the comfortable density, in each theme @basis/ui ships, as an app's
 * routes are screenshotted, compared pixel for pixel with the screenshots in `screenshots/`. Text renders differently
 * from one machine to the next, so these run only in the pinned Playwright image: run them with `vp run
 * @basis/parallax-demo#e2e screenshots`, and take new ones with `--update-snapshots`. The status lines say when the
 * data was read, which changes with every run, so they are masked. */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { chartsDrawn, errorsOf, gridsDrawn, open, paintAfresh } from "./helpers.ts";
import type { Mode } from "./helpers.ts";

test.skip(
  process.env["PARALLAX_PINNED_IMAGE"] !== "1",
  "Screenshots are compared only in the pinned Playwright image: run vp run @basis/parallax-demo#e2e.",
);

/** A page, and what it draws once it is ready: its grids' rows and how many charts. */
interface Shot {
  readonly name: string;
  readonly path: string;
  readonly rows: readonly number[];
  readonly charts: number;
}

const shots: readonly Shot[] = [
  { charts: 0, name: "pivot", path: "/", rows: [] },
  { charts: 0, name: "trades", path: "/trades", rows: [1_000_000] },
  { charts: 0, name: "largest-trades", path: "/largest-trades", rows: [1_000_000] },
  { charts: 0, name: "prices", path: "/prices", rows: [136_150] },
  { charts: 0, name: "small-tables", path: "/small-tables", rows: [300, 500] },
  { charts: 0, name: "data-from-the-app", path: "/data-from-the-app", rows: [2000] },
  { charts: 5, name: "dashboard", path: "/dashboard", rows: [300, 500] },
  { charts: 10, name: "breakdowns", path: "/breakdowns", rows: [] },
  { charts: 14, name: "charts", path: "/charts", rows: [] },
  { charts: 1, name: "technical", path: "/technical", rows: [] },
  { charts: 5, name: "small-charts", path: "/small-charts", rows: [] },
  { charts: 5, name: "fixed-income", path: "/fixed-income", rows: [600] },
];

/** Compares the window with its screenshot, exactly: in the pinned image drawing is deterministic, and the default
 * tolerance misses a change of a light wash. */
async function matches(page: Page, name: string): Promise<void> {
  // A pointer resting on a cell or a chart would bring up its tooltip.
  await page.mouse.move(0, 0);
  await paintAfresh(page);
  await expect(page).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    mask: [page.locator('[data-slot="grid-status"], [data-slot="chart-status"]')],
    maxDiffPixels: 0,
    threshold: 0,
  });
}

/** The one page screenshotted in each of @basis/ui's other themes, to show the demo follows it: the dashboard, in
 * desk's light mode and high-contrast's dark. Every page is screenshotted in the default theme, whose screenshots carry
 * no theme in their names; the maintainer decided on 2026-11-11 that the other themes need no more. The list holds
 * every theme of @basis/ui's `themeNames`, which parallax's unit test of tests/e2e/ui-themes.ts holds its own list to. */
const runs = [
  ...shots.flatMap((shot) =>
    (["light", "dark"] as const).map((mode) => ({ mode, shot, theme: "default" }) as const),
  ),
  ...shots
    .filter((shot) => shot.name === "dashboard")
    .flatMap(
      (shot) =>
        [
          { mode: "light", shot, theme: "desk" },
          { mode: "dark", shot, theme: "high-contrast" },
        ] as const,
    ),
] as const satisfies readonly {
  mode: Mode;
  theme: "default" | "desk" | "high-contrast";
  shot: (typeof shots)[number];
}[];

for (const { mode, shot, theme } of runs) {
  const suffix = theme === "default" ? "" : `-${theme}`;
  test(`${shot.name} draws as in its screenshot, ${theme} theme, ${mode} mode`, async ({
    page,
  }) => {
    const errors = errorsOf(page);
    await open(page, shot.path, { mode, theme });
    // A page of charts shows its grids beside them, if any; a page of grids shows one at least.
    if (shot.charts > 0) {
      await chartsDrawn(page, shot.charts);
    }
    await gridsDrawn(page, shot.rows, { some: shot.charts === 0 });
    await matches(page, `${shot.name}-${mode}${suffix}.png`);
    expect(errors).toStrictEqual([]);
  });
}
