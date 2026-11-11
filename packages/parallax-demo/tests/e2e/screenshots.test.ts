/* Every page of the demo, in light and dark at the comfortable density, in each theme @basis/ui ships, as an app's routes are screenshotted, and the
 * theme studio open, compared pixel for pixel with the screenshots in `screenshots/`. Text renders differently from
 * one machine to the next, so these run only in the pinned Playwright image: run them with `vp run
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

/** @basis/ui's themes, the default first, whose screenshots carry no theme in their names: its `themeNames`, which
 * parallax's unit test of tests/e2e/ui-themes.ts holds its own list to. */
const themes = ["default", "desk", "high-contrast"] as const;

for (const theme of themes) {
  for (const mode of ["light", "dark"] as const satisfies readonly Mode[]) {
    for (const shot of shots) {
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
  }
}

test("the theme studio, open over a page, draws as in its screenshot", async ({ page }) => {
  await open(page, "/small-tables");
  await gridsDrawn(page, [300, 500]);
  await page.getByRole("button", { name: "Theme studio" }).click();
  await expect(page.getByRole("dialog", { name: "Theme studio" })).toBeVisible();
  await matches(page, "theme-studio-light.png");
});
