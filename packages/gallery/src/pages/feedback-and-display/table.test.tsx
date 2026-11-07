import "#styles.css";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { computedColour } from "./test-support.ts";

function Positions(): ReactElement {
  return (
    <Table>
      <TableCaption>Top positions</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Security</TableHead>
          <TableHead variant="numeric">Par</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>UST 4.250% 2034</TableCell>
          <TableCell variant="numeric">111,111</TableCell>
        </TableRow>
        <TableRow data-state="selected">
          <TableCell>UST 3.875% 2033</TableCell>
          <TableCell variant="numeric">888,888</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

/** The computed style of the element whose whole text is `text`. */
function styleOf(text: string): CSSStyleDeclaration {
  return getComputedStyle(page.getByText(text, { exact: true }).element());
}

/** The width of the text in `cell`, as drawn. */
function textWidth(cell: Element): number {
  const range = document.createRange();
  range.selectNodeContents(cell);
  return range.getBoundingClientRect().width;
}

describe("Table", () => {
  test("is a table named by its caption, with its headings in th elements in its thead", async () => {
    const screen = await render(<Positions />);
    const table = screen.getByRole("table", { name: "Top positions" });
    await expect.element(table.getByRole("cell", { name: "888,888" })).toBeVisible();
    const heading = table.getByText("Par").element();
    expect([heading.tagName, heading.parentElement?.parentElement?.tagName]).toStrictEqual([
      "TH",
      "THEAD",
    ]);
  });

  test("numeric cells and headings align right, and the cells use tabular figures", async () => {
    await render(<Positions />);
    expect(["Par", "111,111", "888,888"].map((text) => styleOf(text).textAlign)).toStrictEqual([
      "right",
      "right",
      "right",
    ]);
    expect(["111,111", "888,888"].map((text) => styleOf(text).fontVariantNumeric)).toStrictEqual([
      "tabular-nums",
      "tabular-nums",
    ]);
  });

  test("text headings align left and text cells to the start, in the font's own figures", async () => {
    await render(<Positions />);
    const styles = ["Security", "UST 4.250% 2034"].map((text) => styleOf(text));
    expect(styles.map((style) => style.textAlign)).toStrictEqual(["left", "start"]);
    expect(styles.map((style) => style.fontVariantNumeric)).toStrictEqual(["normal", "normal"]);
  });

  test("a numeric column's digits line up by place", async () => {
    const screen = await render(<Positions />);
    const ones = screen.getByText("111,111", { exact: true }).element();
    const eights = screen.getByText("888,888", { exact: true }).element();
    expect(textWidth(ones)).toBe(textWidth(eights));
    const onesRange = document.createRange();
    onesRange.selectNodeContents(ones);
    const eightsRange = document.createRange();
    eightsRange.selectNodeContents(eights);
    expect(onesRange.getBoundingClientRect().right).toBe(eightsRange.getBoundingClientRect().right);
  });

  test("a selected row takes the theme's selection colour", async () => {
    const screen = await render(<Positions />);
    const selected = screen.getByText("UST 3.875% 2033").element().closest("tr");
    const plain = screen.getByText("UST 4.250% 2034").element().closest("tr");
    expect(selected === null ? "" : getComputedStyle(selected).backgroundColor).toBe(
      computedColour("var(--selection)"),
    );
    expect(plain === null ? "" : getComputedStyle(plain).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });
});
