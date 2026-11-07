import "@basis/ui/styles.css";

import { beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import type { LayoutInput } from "#layout/layout.ts";
import { decodeLayout, encodeLayout } from "#layout/share.ts";

import { canvasOf, renderPivot } from "./pivot-helpers.tsx";

/** The filter on sector that keeps its blank rows. */
const blankSector = { column: "sector", columns: [], op: "in", value: null, values: [null] };

/** The pivot of the holdings, Atlas's alone. */
const atlasOnly: LayoutInput = {
  expand_depth: 2,
  filters: [{ column: "fund", op: "in", values: ["Atlas"] }],
  group_by: ["fund", "desk"],
  measures: [{ aggregate: "sum", column: "market_value" }],
};

beforeEach(async () => {
  // Wide enough for the settings and the table beside them.
  await page.viewport(1280, 900);
});

describe("Pivot's field list", () => {
  test("ticks a text field into Rows and a number into Values, and unticking takes a field out of every area", async () => {
    const { screen, last } = await renderPivot();
    const fields = screen.getByRole("list", { name: "Fields" });
    await fields.getByRole("listitem").filter({ hasText: "sector" }).getByRole("checkbox").click();
    await expect.poll(() => last()?.group_by).toStrictEqual(["fund", "desk", "sector"]);
    await fields
      .getByRole("listitem")
      .filter({ hasText: "quantity" })
      .getByRole("checkbox")
      .click();
    await expect
      .poll(() => last()?.measures.map((measure) => [measure.aggregate, measure.column]))
      .toStrictEqual([
        ["sum", "market_value"],
        ["sum", "quantity"],
      ]);
    await expect
      .element(fields.getByRole("listitem").filter({ hasText: "quantity" }))
      .toHaveTextContent("quantityValues");
    await fields.getByRole("listitem").filter({ hasText: "fund" }).getByRole("checkbox").click();
    await expect.poll(() => last()?.group_by).toStrictEqual(["desk", "sector"]);
  });

  test("adds a field to an area from its menu, and finds a field by its name", async () => {
    const { screen, last, grid } = await renderPivot();
    await screen.getByRole("button", { name: "Add sector to" }).click();
    await screen.getByRole("menuitem", { name: "Add to Columns" }).click();
    await expect.poll(() => last()?.split_by).toStrictEqual(["sector"]);
    // Corp, Govt, (blank) and the total, each a sum of market value.
    await expect.element(grid).toHaveAttribute("aria-colcount", "4");
    await screen.getByRole("searchbox", { name: "Find a field" }).fill("QUANT");
    await expect
      .poll(() => screen.getByRole("list", { name: "Fields" }).getByRole("listitem").elements())
      .toHaveLength(1);
  });
});

describe("Pivot's areas", () => {
  test("moves a chip a place with Alt+Down from its buttons, keeps the focus on it, and says so", async () => {
    const { screen, last } = await renderPivot();
    const options = screen.getByRole("button", { name: "Options for fund" });
    options.element().focus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await expect.poll(() => last()?.group_by).toStrictEqual(["desk", "fund"]);
    await expect.element(options).toHaveFocus();
    await expect
      .element(screen.getByRole("status").filter({ hasText: "moved" }))
      .toHaveTextContent("fund moved to 2 of 2 in Rows");
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await expect.poll(() => last()?.group_by).toStrictEqual(["fund", "desk"]);
  });

  test("moves a group to Columns from its menu, and removes one with its button", async () => {
    const { screen, last } = await renderPivot();
    await screen.getByRole("button", { name: "Options for desk" }).click();
    const menu = screen.getByRole("menu", { name: "Field desk" });
    await expect.element(menu.getByRole("menuitem", { name: "Move down" })).toBeDisabled();
    await menu.getByRole("menuitem", { name: "Move to Columns" }).click();
    await expect.poll(() => last()).toMatchObject({ group_by: ["fund"], split_by: ["desk"] });
    await screen.getByRole("button", { name: "Remove fund" }).click();
    await expect.poll(() => last()).toMatchObject({ expanded: [], group_by: [] });
  });

  test("a value's menu changes how it is shown", async () => {
    const { screen, last } = await renderPivot();
    await screen.getByRole("button", { name: "Options for Sum of market_value" }).click();
    const menu = screen.getByRole("dialog", { name: "Value Sum of market_value" });
    await menu.getByRole("combobox", { name: "Show as" }).selectOptions("percent_of_grand_total");
    await expect.poll(() => last()?.measures[0]?.show_as).toBe("percent_of_grand_total");
    await menu.getByRole("combobox", { name: "Negatives" }).selectOptions("parentheses");
    await expect.poll(() => last()?.measures[0]?.format?.negative).toBe("parentheses");
  });

  test("a value's menu changes how it is computed, and stays open, named after the value", async () => {
    const { screen, last } = await renderPivot();
    await screen.getByRole("button", { name: "Options for Sum of market_value" }).click();
    const menu = screen.getByRole("dialog", { name: /^Value /u });
    await menu.getByRole("combobox", { name: "Aggregate" }).selectOptions("count");
    await expect
      .poll(() => last()?.measures[0])
      .toMatchObject({ aggregate: "count", column: "market_value" });
    await menu.getByRole("combobox", { name: "Abbreviate" }).selectOptions("thousands");
    await expect.poll(() => last()?.measures[0]?.format?.abbreviate).toBe("thousands");
    await expect
      .element(screen.getByRole("button", { name: "Options for Count of market_value" }))
      .toBeVisible();
  });

  test("drags a field into Columns, and a chip from Rows before the first of Columns", async () => {
    const { screen, last } = await renderPivot();
    const fields = screen.getByRole("list", { name: "Fields" });
    const columns = screen.getByRole("list", { name: "Columns" });
    await userEvent.dragAndDrop(
      fields.getByRole("listitem").filter({ hasText: "sector" }),
      columns,
    );
    await expect.poll(() => last()?.split_by).toStrictEqual(["sector"]);
    const desk = screen
      .getByRole("list", { name: "Rows" })
      .getByRole("listitem")
      .filter({ hasText: "desk" });
    await userEvent.dragAndDrop(desk, columns.getByRole("listitem").first(), {
      targetPosition: { x: 20, y: 2 },
    });
    await expect
      .poll(() => last())
      .toMatchObject({ group_by: ["fund"], split_by: ["desk", "sector"] });
  });

  test("a chip dropped on Filters leaves its area and filters by its column", async () => {
    const { screen, last } = await renderPivot();
    const desk = screen
      .getByRole("list", { name: "Rows" })
      .getByRole("listitem")
      .filter({ hasText: "desk" });
    await userEvent.dragAndDrop(desk, screen.getByRole("list", { name: "Filters" }));
    await expect.poll(() => last()?.group_by).toStrictEqual(["fund"]);
    await expect.element(screen.getByRole("dialog", { name: "Filter desk" })).toBeVisible();
  });
});

describe("Pivot's filters", () => {
  test("a value picked as (blank) keeps the rows without one", async () => {
    const { screen, last, grid } = await renderPivot();
    await screen.getByRole("button", { name: "Add sector to" }).click();
    await screen.getByRole("menuitem", { name: "Add to Filters" }).click();
    const editor = screen.getByRole("dialog", { name: "Filter sector" });
    await editor.getByRole("checkbox", { name: /^\(blank\)/u }).click();
    await expect.poll(() => last()?.filters).toStrictEqual([blankSector]);
    // The grand total, Atlas, and Atlas's rates desk: the one position without a sector.
    await expect.element(grid).toHaveAttribute("aria-rowcount", "3");
    await expect
      .element(screen.getByRole("list", { name: "Filters" }).getByRole("listitem"))
      .toHaveTextContent("sector: (blank)");
  });

  test("keeps a filter's chip at (All) until a value is picked, with its editor open", async () => {
    const { screen, last, grid } = await renderPivot();
    await screen.getByRole("button", { name: "Add fund to" }).click();
    await screen.getByRole("menuitem", { name: "Add to Filters" }).click();
    const chip = screen.getByRole("list", { name: "Filters" }).getByRole("listitem");
    await expect.element(chip).toHaveTextContent("fund: (All)");
    expect(last()).toBeUndefined();
    await screen
      .getByRole("dialog", { name: "Filter fund" })
      .getByRole("checkbox", { name: /^Atlas/u })
      .click();
    await expect.element(grid).toHaveAttribute("aria-rowcount", "4");
    await expect.element(chip).toHaveTextContent("fund: Atlas");
  });

  test("keeps a filter's chip at (All) once its last value is unticked", async () => {
    const { screen, last, grid } = await renderPivot(atlasOnly, "4");
    await screen.getByRole("button", { name: "fund: Atlas" }).click();
    await screen
      .getByRole("dialog", { name: "Filter fund" })
      .getByRole("checkbox", { name: /^Atlas/u })
      .click();
    await expect.element(grid).toHaveAttribute("aria-rowcount", "7");
    expect(last()?.filters).toStrictEqual([]);
    await expect
      .element(screen.getByRole("list", { name: "Filters" }).getByRole("listitem"))
      .toHaveTextContent("fund: (All)");
  });

  test("a filter's chip goes with its remove button, and the rows come back", async () => {
    const { screen, grid } = await renderPivot(atlasOnly, "4");
    await screen.getByRole("button", { name: "Remove the filter on fund" }).click();
    await expect.element(grid).toHaveAttribute("aria-rowcount", "7");
    await expect
      .element(screen.getByRole("list", { name: "Filters" }).getByRole("listitem"))
      .toHaveTextContent("Drop fields here to filter by them");
  });
});

describe("Pivot's table", () => {
  test("a measure header's menu sorts the groups by the value", async () => {
    const { screen, last, grid } = await renderPivot();
    // The first row's value, right of the group column.
    await userEvent.click(canvasOf(grid), { position: { x: 300, y: 51 } });
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    const menu = screen.getByRole("dialog", { name: "Value Sum of market_value" });
    await expect.element(menu.getByRole("menuitem").first()).toHaveFocus();
    await menu.getByRole("menuitem", { name: "Sort largest first" }).click();
    await expect
      .poll(() => last()?.group_sort)
      .toStrictEqual({ by: { measure: 0 }, descending: true });
  });

  test("a double click on a value opens the rows behind it, until the groups change", async () => {
    const { screen, grid } = await renderPivot();
    // Atlas's row, the second.
    await userEvent.dblClick(canvasOf(grid), { position: { x: 300, y: 81 } });
    const rows = screen.getByRole("region", { name: "Rows behind Atlas" });
    await expect
      .element(rows.getByRole("grid", { name: "Rows behind Atlas" }))
      .toHaveAttribute("aria-rowcount", "3");
    // Its filters put the rows there, so it shows no chips to remove them.
    await expect
      .element(rows.getByRole("button", { name: /^Remove the filter/u }))
      .not.toBeInTheDocument();
    await screen.getByRole("button", { name: "Remove desk" }).click();
    await expect.element(rows).not.toBeInTheDocument();
  });

  test("an edited pivot comes back the same through a link", async () => {
    const { screen, last } = await renderPivot();
    await screen.getByRole("button", { name: "Add sector to" }).click();
    await screen.getByRole("menuitem", { name: "Add to Columns" }).click();
    await expect.poll(() => last()?.split_by).toStrictEqual(["sector"]);
    const edited = last();
    expect(edited).toBeDefined();
    const link = await encodeLayout(edited ?? {});
    await expect(decodeLayout(link)).resolves.toStrictEqual(edited);
  });

  test("its options open fewer levels and keep the top groups by a value", async () => {
    const { screen, last, grid } = await renderPivot();
    const options = screen.getByRole("region", { name: "Options" });
    await options.getByRole("spinbutton", { name: "Open levels" }).fill("0");
    await expect.poll(() => last()).toMatchObject({ expand_depth: 0, expanded: [] });
    await expect.element(grid).toHaveAttribute("aria-rowcount", "3");
    await options.getByRole("checkbox", { name: "Top" }).click();
    await options.getByRole("spinbutton", { name: "How many groups" }).fill("1");
    await expect.poll(() => last()?.top_n?.n).toBe(1);
    expect(last()?.top_n).toMatchObject({ largest: true, measure: 0, other: true });
    await expect
      .element(options.getByRole("combobox", { name: "Top-N measure" }))
      .toHaveDisplayValue("by Sum of market_value");
  });

  test("hides and shows its settings", async () => {
    const { screen } = await renderPivot();
    const hide = screen.getByRole("button", { name: "Hide settings" });
    await expect.element(hide).toHaveAttribute("aria-expanded", "true");
    await hide.click();
    await expect.element(screen.getByRole("list", { name: "Fields" })).not.toBeInTheDocument();
    await screen.getByRole("button", { name: "Show settings" }).click();
    await expect.element(screen.getByRole("list", { name: "Fields" })).toBeVisible();
  });
});
