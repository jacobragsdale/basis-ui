/* The grid's screenshots, compared pixel for pixel with those in `screenshots/`: the small tables' grids, in both
 * schemes, in parallax's standard look, its airy look, and `@basis/ui`'s, with a header menu open, and grouped. The
 * book in `@basis/ui`'s look is taken again at 1.25 and 1.5, the ratios of a desktop scaled to 125 % and 150 %, where
 * every rule must still be whole device pixels. Fonts and text rendering differ between machines, so these run only in the pinned Playwright image: run them with
 * `tests/e2e/grid/in-image.sh screenshots`, and take new ones by adding `--update-snapshots`. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// oxlint-disable-next-line import/no-relative-parent-imports -- the grid, pivot and charts suites share the list of themes, which is no part of the package to import by name.
import { otherThemes } from "../ui-themes.ts";
import { bookRows, openMenu } from "./helpers.ts";

test.skip(
  process.env["PARALLAX_PINNED_IMAGE"] !== "1",
  "Screenshots are compared only in the pinned Playwright image: run tests/e2e/grid/in-image.sh.",
);

/** In the pinned image drawing is deterministic, so every pixel must match: the default tolerance misses a light
 * wash. */
const exactly = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixels: 0,
  // In device pixels, which at a ratio of 1 are CSS pixels: a scaled desktop's screenshot shows each device pixel.
  scale: "device",
  threshold: 0,
} as const;

/** Waits for two animation frames in the page. */
async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const first = Promise.withResolvers<number>();
    requestAnimationFrame(first.resolve);
    await first.promise;
    const second = Promise.withResolvers<number>();
    requestAnimationFrame(second.resolve);
    await second.promise;
  });
}

/**
 * Paints the whole page again. A rounded corner painted while the page was still loading can come out a shade different
 * from one painted whole, so a screenshot taken straight away would depend on when the data arrived.
 */
async function paintAfresh(page: Page): Promise<void> {
  // A hidden page cannot hold the focus, so Chromium takes it from a menu's item; it is given back, as it was.
  const focused = await page.evaluateHandle(() => document.activeElement);
  await page.evaluate(() => {
    document.body.style.visibility = "hidden";
  });
  await twoFrames(page);
  await page.evaluate((element) => {
    document.body.style.visibility = "";
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
    }
  }, focused);
  await twoFrames(page);
}

/** Opens the small tables' page with `query`, waits for the book's rows, and moves the pointer away, since a pointer
 * resting on a cell would bring up its tooltip. */
async function book(page: Page, query: string): Promise<Locator> {
  await page.goto(`/?preset=small&${query}`);
  const section = page.locator('section[data-table="book"]');
  await expect(section.getByRole("grid")).toHaveAttribute("aria-rowcount", String(bookRows), {
    timeout: 60_000,
  });
  await expect(page.locator('section[data-table="blotter"]').getByRole("grid")).not.toHaveAttribute(
    "aria-rowcount",
    "0",
  );
  await page.mouse.move(0, 0);
  await paintAfresh(page);
  return section;
}

/**
 * A section's screenshot down to its status bar, which tells when the data was read and how long ago, and so changes
 * from one run to the next. The grid's rounded bottom corners, which a mask beside them could tint a shade from run to
 * run, are left out with it.
 */
async function sectionShot(section: Locator, name: string): Promise<void> {
  const box = await section.boundingBox();
  const status = await section.locator("[data-slot=grid-status]").boundingBox();
  if (box === null || status === null) {
    throw new Error("The section or its status bar is not on the page.");
  }
  const clip = { ...box, height: status.y - box.y };
  await expect(section.page()).toHaveScreenshot(name, { ...exactly, clip });
}

for (const theme of ["light", "dark"] as const) {
  test(`the book's grid draws as in its screenshot, in each look, ${theme} scheme`, async ({
    page,
  }) => {
    await sectionShot(await book(page, `theme=${theme}`), `grid-book-${theme}.png`);
    await sectionShot(await book(page, `theme=${theme}&look=airy`), `grid-book-airy-${theme}.png`);
    await sectionShot(
      await book(page, `theme=${theme}&look=basis`),
      `grid-book-basis-${theme}.png`,
    );
  });

  test(`the book's grid in @basis/ui's look draws as in its screenshot at a scaled desktop's ratio, ${theme} scheme`, async ({
    page,
  }) => {
    await sectionShot(
      await book(page, `theme=${theme}&look=basis`),
      `grid-book-basis-${theme}.png`,
    );
  });

  test(`the fund's header menu draws as in its screenshot, ${theme} scheme`, async ({ page }) => {
    const section = await book(page, `theme=${theme}`);
    const menu = await openMenu(page, section, 1);
    await expect(menu).toHaveAttribute("aria-label", "Column fund");
    await expect(menu.getByRole("list", { name: "Values" }).getByRole("checkbox")).toHaveCount(8, {
      timeout: 30_000,
    });
    await page.mouse.move(0, 0);
    await paintAfresh(page);
    await expect(menu).toHaveScreenshot(`grid-header-menu-${theme}.png`, exactly);
  });

  test(`the blotter grouped by fund draws as in its screenshot, ${theme} scheme`, async ({
    page,
  }) => {
    await book(page, `theme=${theme}`);
    const blotter = page.locator('section[data-table="blotter"]');
    const menu = await openMenu(page, blotter, 3);
    await menu.getByRole("menuitem", { name: "Group by this column" }).click();
    await expect(blotter.getByRole("grid")).toHaveAttribute("aria-rowcount", "508");
    await page.mouse.move(0, 0);
    await paintAfresh(page);
    await sectionShot(blotter, `grid-detail-groups-${theme}.png`);
  });
}

/* @basis/ui's other themes: the book in @basis/ui's look, and a header's menu, which is @basis/ui's, in each. */
for (const ui of otherThemes) {
  for (const theme of ["light", "dark"] as const) {
    test(`the book's grid and a header's menu draw as in their screenshots in @basis/ui's ${ui} theme, ${theme} scheme`, async ({
      page,
    }) => {
      const section = await book(page, `theme=${theme}&look=basis&ui=${ui}`);
      await sectionShot(section, `grid-book-basis-${theme}-${ui}.png`);
      const menu = await openMenu(page, section, 1);
      await expect(menu.getByRole("list", { name: "Values" }).getByRole("checkbox")).toHaveCount(
        8,
        {
          timeout: 30_000,
        },
      );
      await page.mouse.move(0, 0);
      await paintAfresh(page);
      await expect(menu).toHaveScreenshot(`grid-header-menu-${theme}-${ui}.png`, exactly);
    });
  }
}

/* Rich cells: the book with a bar, a diverging heat fill, badges, a link and a rule, in every shipped theme. */
for (const ui of ["default", ...otherThemes]) {
  for (const theme of ["light", "dark"] as const) {
    test(`the book's rich cells draw as in their screenshot in @basis/ui's ${ui} theme, ${theme} scheme`, async ({
      page,
    }) => {
      const section = await book(page, `theme=${theme}&look=basis&cells=1&ui=${ui}`);
      await sectionShot(section, `grid-book-cells-${theme}-${ui}.png`);
    });
  }
}
