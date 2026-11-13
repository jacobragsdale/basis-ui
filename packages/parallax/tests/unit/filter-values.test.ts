/* A condition's value as the user types it, read by the column's display format: 5 in a column shown as a percentage
 * is 5%, separators and suffixes are what the column shows, and what cannot be read stays text, which the engine
 * refuses with its reason. And a cell's value as "Filter by" sends it: the engine's exact form, never its display. */

import { describe, expect, test } from "vite-plus/test";

import { cellOperand } from "#grid/actions.ts";
import { filterValue } from "#grid/labels.ts";
import { checkLayout } from "#layout/layout.ts";
import type { LayoutFormat } from "#layout/layout.ts";

/** A display format with every default filled in, as a layout holds it. */
function formatOf(input: Partial<LayoutFormat>): LayoutFormat {
  const checked = checkLayout({ dataset: "rates", formats: { rate: input } });
  const format = checked.ok ? checked.layout.formats["rate"] : undefined;
  if (format === undefined) {
    throw new Error("The format did not check.");
  }
  return format;
}

const plain = formatOf({});
const percent = formatOf({ percent: true });
const bps = formatOf({ bps: true });
const millions = formatOf({ abbreviate: "millions" });
const thirtySeconds = formatOf({ thirty_seconds: "thirty_seconds" });

describe(filterValue, () => {
  test.each([
    { expected: 0.05, format: percent, kind: "float", text: "5" },
    { expected: 0.0525, format: plain, kind: "float", text: "5.25%" },
    { expected: 1000, format: plain, kind: "float", text: "1,000" },
    { expected: -1250.5, format: plain, kind: "float", text: "(1,250.5)" },
    { expected: 0.0025, format: bps, kind: "float", text: "25" },
    { expected: 0.0025, format: plain, kind: "float", text: "25 bp" },
    { expected: 1_500_000, format: millions, kind: "float", text: "1.5" },
    { expected: 2000, format: plain, kind: "float", text: "2K" },
    { expected: 99.5, format: thirtySeconds, kind: "float", text: "99-16" },
    { expected: 99.515625, format: thirtySeconds, kind: "float", text: "99-16+" },
    { expected: "0.0525", format: percent, kind: "decimal", text: "5.25" },
    { expected: "1234567.891", format: plain, kind: "decimal", text: "1,234,567.891" },
    { expected: "12000", format: plain, kind: "integer", text: "12,000" },
  ] as const)("reads $kind $text as the column shows it", ({ kind, text, format, expected }) => {
    expect(filterValue(kind, text, format)).toBe(expected);
  });

  test("keeps text it cannot read as a number, for the engine to refuse with its reason", () => {
    expect(filterValue("float", "five", plain)).toBe("five");
    expect(filterValue("text", " 5% ", percent)).toBe(" 5% ");
    expect(filterValue("float", "  ", plain)).toBeNull();
  });
});

describe(cellOperand, () => {
  test("sends the engine's exact form, not the text the cell shows", () => {
    expect(cellOperand({ kind: "timestamp", micros: 1_793_511_000_123_456n, zoned: true })).toBe(
      "2026-11-01T05:30:00.123456Z",
    );
    expect(cellOperand({ kind: "decimal", scale: 2, unscaled: 123_450n })).toBe("1234.50");
    expect(cellOperand({ kind: "integer", value: 2n ** 60n })).toBe("1152921504606846976");
    expect(cellOperand({ kind: "integer", value: 42n })).toBe(42);
    expect(cellOperand({ days: 20_758, kind: "date" })).toBe("2026-11-01");
    expect(cellOperand({ kind: "null" })).toBeNull();
  });
});
