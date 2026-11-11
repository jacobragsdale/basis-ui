import { describe, expect, test } from "vite-plus/test";

import { meets, numberOf, ruleFor } from "#grid/paint/rules.ts";
import type { CellValue } from "#frame/cell.ts";
import type { LayoutRule } from "#layout/cells.ts";

type When = LayoutRule["when"];

function number(value: number): CellValue {
  return { kind: "number", value };
}

function text(value: string): CellValue {
  return { kind: "text", value };
}

const none: CellValue = { kind: "null" };

function when(op: When["op"], value: When["value"] = null, values: When["values"] = []): When {
  return { op, value, values };
}

describe(meets, () => {
  test("compares numbers as numbers, and text ignoring case", () => {
    expect(meets(when("lt", 95), number(94.5), "94.50")).toBe(true);
    expect(meets(when("ge", 95), number(94.5), "94.50")).toBe(false);
    expect(meets(when("eq", "aaa"), text("AAA"), "AAA")).toBe(true);
    expect(meets(when("contains", "ener"), text("Energy"), "Energy")).toBe(true);
    expect(meets(when("in", null, ["B", "CCC"]), text("ccc"), "ccc")).toBe(true);
    expect(meets(when("not_in", null, ["B"]), text("B"), "B")).toBe(false);
  });

  test("tests nulls with is_null alone", () => {
    expect(meets(when("is_null"), none, "")).toBe(true);
    expect(meets(when("lt", 1), none, "")).toBe(false);
    expect(meets(when("is_not_null"), number(0), "0")).toBe(true);
  });
});

describe(ruleFor, () => {
  test("takes the first rule the value meets", () => {
    const rules: LayoutRule[] = [
      { format: { bold: true, fill: false, tone: "negative" }, when: when("lt", 0) },
      { format: { bold: false, fill: true, tone: "warning" }, when: when("lt", 10) },
    ];
    expect(ruleFor(rules, number(-1), "-1")?.tone).toBe("negative");
    expect(ruleFor(rules, number(5), "5")?.tone).toBe("warning");
    expect(ruleFor(rules, number(50), "50")).toBeNull();
    expect(ruleFor(undefined, number(5), "5")).toBeNull();
  });
});

describe(numberOf, () => {
  test("reads integers and exact decimals as numbers, and nothing else", () => {
    expect(numberOf({ kind: "integer", value: 12n })).toBe(12);
    expect(numberOf({ kind: "decimal", scale: 2, unscaled: -12_345n })).toBe(-123.45);
    expect(numberOf(text("12"))).toBeNull();
  });
});
