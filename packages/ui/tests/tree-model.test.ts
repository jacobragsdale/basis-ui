/* The tree's rows and keys, as the WAI-ARIA tree view pattern has them. */

import { describe, expect, test } from "vite-plus/test";

import { moveFor, pathTo, visibleRows } from "#components/tree-model.ts";
import type { TreeNode } from "#components/tree-model.ts";

const books: readonly TreeNode<string>[] = [
  {
    children: [
      { label: "Treasuries", value: "ust" },
      { label: "Agencies", value: "agency" },
    ],
    label: "Rates",
    value: "rates",
  },
  {
    children: [
      {
        children: [
          { label: "Financials", value: "ig-fin" },
          { label: "Utilities", value: "ig-util" },
        ],
        label: "Investment grade",
        value: "ig",
      },
      { label: "High yield", value: "hy" },
    ],
    label: "Credit",
    value: "credit",
  },
];

const valuesOf = (expanded: readonly string[]): readonly string[] =>
  visibleRows(books, new Set(expanded)).map((row) => row.node.value);

describe(visibleRows, () => {
  test("shows the roots, and the children of each expanded branch under it, at their depth", () => {
    expect(valuesOf([])).toStrictEqual(["rates", "credit"]);
    expect(valuesOf(["credit", "ig"])).toStrictEqual([
      "rates",
      "credit",
      "ig",
      "ig-fin",
      "ig-util",
      "hy",
    ]);
    expect(visibleRows(books, new Set(["credit", "ig"]))[3]).toMatchObject({
      level: 3,
      parent: "ig",
    });
  });

  test("hides a branch's children while its parent is closed, though it stays expanded", () => {
    expect(valuesOf(["ig"])).toStrictEqual(["rates", "credit"]);
  });
});

describe(pathTo, () => {
  test("is the nodes from the root down to the value, or none", () => {
    expect(pathTo(books, "ig-util").map((node) => node.label)).toStrictEqual([
      "Credit",
      "Investment grade",
      "Utilities",
    ]);
    expect(pathTo(books, "nowhere")).toStrictEqual([]);
  });
});

describe(moveFor, () => {
  const expanded = new Set(["credit"]);
  const rows = visibleRows(books, expanded);

  test.each([
    ["ArrowDown", "credit", { kind: "focus", value: "ig" }],
    ["ArrowUp", "credit", { kind: "focus", value: "rates" }],
    ["Home", "hy", { kind: "focus", value: "rates" }],
    ["End", "rates", { kind: "focus", value: "hy" }],
    ["ArrowRight", "rates", { kind: "expand", value: "rates" }],
    ["ArrowRight", "credit", { kind: "focus", value: "ig" }],
    ["ArrowRight", "hy", { kind: "none" }],
    ["ArrowLeft", "credit", { kind: "collapse", value: "credit" }],
    ["ArrowLeft", "hy", { kind: "focus", value: "credit" }],
    ["ArrowLeft", "rates", { kind: "none" }],
    ["ArrowDown", "hy", { kind: "none" }],
  ] as const)("%s on %s", (key, focused, move) => {
    expect(moveFor(key, { expanded, focused, rows })).toStrictEqual(move);
  });
});
