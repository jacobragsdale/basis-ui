import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import type { ReactNode } from "react";
import type { RenderResult } from "vitest-browser-react";

import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { PricesChart } from "./charts.tsx";
import { startWorker } from "./data.ts";
import { pressAt } from "./grid-helpers.tsx";
import { GridPage } from "./grid-page.tsx";
import { PivotPage } from "./pivot-page.tsx";

/** The middle of the first row, under the 30 px header of the compact density, the default. */
const firstRow = 42;
const line = { chart: { kind: "line", x: "date", y: ["close"] } } satisfies LayoutInput;
const byFund: LayoutInput = {
  group_by: ["fund"],
  measures: [{ aggregate: "sum", column: "market_value" }],
};

/** Renders `view` beside a button of the page's own, which goes inert while the view fills the window. */
async function beside(view: ReactNode): Promise<RenderResult> {
  return render(
    <ParallaxProvider worker={startWorker}>
      <button type="button">Elsewhere</button>
      {view}
    </ParallaxProvider>,
  );
}

/** The element `slot` names, which is what fills the window. */
function slotOf(screen: RenderResult, slot: string): HTMLElement {
  const element = screen.container.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (element === null) {
    throw new Error(`No ${slot} on the page.`);
  }
  return element;
}

/** Whether the page's own button is inert, as the page around a maximized view is. */
function pageInert(screen: RenderResult): boolean {
  return (
    screen
      .getByRole("button", { name: "Elsewhere", includeHidden: true })
      .element()
      .closest("[inert]") !== null
  );
}

async function maximizeFrom(scope: Locator): Promise<void> {
  await scope.getByRole("button", { name: "Maximize" }).click();
}

/** Renders the positions' grid beside the page's own button, and waits for its rows. */
async function gridBeside(): Promise<{ readonly screen: RenderResult; readonly grid: Locator }> {
  const screen = await beside(<GridPage />);
  const grid = screen.getByRole("grid");
  await expect.element(grid).toHaveAttribute("aria-rowcount", "6");
  return { grid, screen };
}

/** Checks that the element `slot` names fills the window as a dialog named `name`, with the page around it inert. */
async function expectMaximized(screen: RenderResult, slot: string, name: string): Promise<void> {
  const dialog = screen.getByRole("dialog", { name });
  await expect.element(dialog).toHaveAttribute("data-slot", slot);
  expect(getComputedStyle(slotOf(screen, slot)).position).toBe("fixed");
  expect(pageInert(screen)).toBe(true);
}

/** Checks that the element `slot` names is back in its place, and the page around it is not inert. */
async function expectRestored(screen: RenderResult, slot: string): Promise<void> {
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  expect(slotOf(screen, slot).dataset["maximized"]).toBeUndefined();
  expect(pageInert(screen)).toBe(false);
}

/** Selects the grid's first cell and presses Alt+Enter. */
async function altEnterFrom(grid: Locator): Promise<void> {
  await pressAt(grid, { x: 40, y: firstRow });
  await userEvent.keyboard("{Alt>}{Enter}{/Alt}");
}

describe("Maximize", () => {
  test("fills the window with the grid as a dialog, the page inert, until Escape", async () => {
    const { screen, grid } = await gridBeside();
    await maximizeFrom(screen.getByRole("toolbar", { name: "Grid tools" }));
    await expectMaximized(screen, "grid", "positions");
    // The grid stays open: the same rows, and the button now restores.
    await expect.element(grid).toHaveAttribute("aria-rowcount", "6");
    await expect.element(screen.getByRole("button", { name: "Restore" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expectRestored(screen, "grid");
    await expect.element(screen.getByRole("button", { name: "Maximize" })).toHaveFocus();
  });

  test("spends an Escape on the selection first, and Alt+Enter maximizes and restores", async () => {
    const { screen, grid } = await gridBeside();
    await altEnterFrom(grid);
    await expectMaximized(screen, "grid", "positions");
    await userEvent.keyboard("{Escape}");
    // The first Escape dropped the selection; the grid still fills the window.
    await expect.element(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expectRestored(screen, "grid");
    await altEnterFrom(grid);
    await userEvent.keyboard("{Alt>}{Enter}{/Alt}");
    await expectRestored(screen, "grid");
  });

  test("opens the grid's menus while it fills the window, which work as they do in the page", async () => {
    const { screen, grid } = await gridBeside();
    await altEnterFrom(grid);
    await expectMaximized(screen, "grid", "positions");
    await userEvent.keyboard("{ArrowRight}{Alt>}{ArrowDown}{/Alt}");
    const menu = screen.getByRole("dialog", { name: "Column fund" });
    await menu.getByRole("menuitem", { name: "Hide column" }).click();
    await expect.element(grid).toHaveAttribute("aria-colcount", "2");
    // Hiding the column closed the menu; the grid still fills the window.
    await expect.element(screen.getByRole("dialog", { name: "positions" })).toBeInTheDocument();
  });

  test("keeps the grid's place with a placeholder, and a click on the page around restores it", async () => {
    const { screen } = await gridBeside();
    const before = slotOf(screen, "grid").getBoundingClientRect();
    await maximizeFrom(screen.getByRole("toolbar", { name: "Grid tools" }));
    await expectMaximized(screen, "grid", "positions");
    const placeholder = slotOf(screen, "maximize-placeholder").getBoundingClientRect();
    expect([placeholder.width, placeholder.height]).toStrictEqual([before.width, before.height]);
    expect(slotOf(screen, "grid").getBoundingClientRect().width).toBeGreaterThan(before.width);
    await userEvent.click(slotOf(screen, "maximize-backdrop"), { position: { x: 4, y: 4 } });
    await expectRestored(screen, "grid");
    expect(screen.container.querySelector('[data-slot="maximize-placeholder"]')).toBeNull();
  });

  test("maximizes the whole pivot from its table's toolbar, settings with it", async () => {
    const screen = await beside(<PivotPage first={byFund} changes={[]} />);
    await expect.element(screen.getByRole("grid", { name: "holdings" })).toBeInTheDocument();
    await maximizeFrom(screen.getByRole("toolbar", { name: "Grid tools" }));
    await expectMaximized(screen, "pivot", "holdings");
    const dialog = screen.getByRole("dialog", { name: "holdings" });
    await expect
      .element(dialog.getByRole("complementary", { name: "Pivot settings" }))
      .toBeVisible();
    await dialog.getByRole("button", { name: "Restore" }).click();
    await expectRestored(screen, "pivot");
  });

  test("fills the window with a chart, and an Escape on its plot restores it", async () => {
    const screen = await beside(<PricesChart layout={line} />);
    await screen.getByRole("button", { name: "Maximize" }).click();
    const chart = slotOf(screen, "chart");
    await expect.element(screen.getByRole("dialog")).toHaveAttribute("data-slot", "chart");
    expect(getComputedStyle(chart).position).toBe("fixed");
    chart.querySelector<HTMLElement>('[data-slot="chart-plot"]')?.focus();
    await userEvent.keyboard("{Escape}");
    await expectRestored(screen, "chart");
  });

  test("has no Maximize on a chart that turns it off", async () => {
    const screen = await beside(<PricesChart layout={line} maximize={false} />);
    await expect.element(screen.getByRole("button", { name: "Elsewhere" })).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Maximize" })).not.toBeInTheDocument();
  });
});
