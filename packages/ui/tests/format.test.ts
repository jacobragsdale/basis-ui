import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { FormatError, createFormatter, type Format } from "../src/index.ts";

// Written by parallax's Rust formatter; see packages/parallax/crates/parallax-engine/tests/format_fixtures.rs.
const fixtures = new URL(
  "../../parallax/crates/parallax-engine/tests/fixtures/format.json",
  import.meta.url,
);

type Case =
  | {
      readonly kind: "float";
      readonly value: number | "NaN" | "inf" | "-inf";
      readonly text: string;
    }
  | {
      readonly kind: "decimal";
      readonly unscaled: string;
      readonly scale: number;
      readonly text: string;
    }
  | { readonly kind: "integer"; readonly value: string; readonly text: string }
  | { readonly kind: "date"; readonly days: number; readonly text: string }
  | {
      readonly kind: "timestamp";
      readonly micros: string;
      readonly zoned: boolean;
      readonly text: string;
    };

interface Group {
  readonly format: Format;
  readonly cases: readonly Case[];
}

const { groups } = JSON.parse(readFileSync(fixtures, "utf8")) as { groups: readonly Group[] };

function floatOf(value: number | "NaN" | "inf" | "-inf"): number {
  switch (value) {
    case "NaN":
      return Number.NaN;
    case "inf":
      return Number.POSITIVE_INFINITY;
    case "-inf":
      return Number.NEGATIVE_INFINITY;
    default:
      return value;
  }
}

function input(item: Case): string {
  switch (item.kind) {
    case "float":
      return String(item.value);
    case "decimal":
      return `${item.unscaled}e-${String(item.scale)}`;
    case "integer":
      return item.value;
    case "date":
      return `day ${String(item.days)}`;
    case "timestamp":
      return `${item.micros}µs${item.zoned ? " zoned" : ""}`;
  }
}

describe.each(groups.map((group) => [JSON.stringify(group.format), group] as const))(
  "the Rust formatter's fixtures, format %s",
  (_name, group) => {
    const formatter = createFormatter(group.format);
    test.each(group.cases.map((item) => [input(item), item] as const))("%s", (_input, item) => {
      switch (item.kind) {
        case "float":
          expect(formatter.float(floatOf(item.value))).toBe(item.text);
          break;
        case "decimal":
          expect(formatter.decimal(BigInt(item.unscaled), item.scale)).toBe(item.text);
          break;
        case "integer":
          expect(formatter.integer(BigInt(item.value))).toBe(item.text);
          break;
        case "date":
          expect(formatter.date(item.days)).toBe(item.text);
          break;
        case "timestamp":
          expect(formatter.timestamp(BigInt(item.micros), item.zoned)).toBe(item.text);
          break;
      }
    });
  },
);

describe("formats that cannot be used", () => {
  test.each([
    [{ decimals: 31 }, "too-many-decimals"],
    [{ decimals: -1 }, "too-many-decimals"],
    [{ decimals: 1.5 }, "too-many-decimals"],
    [{ percent: true, abbreviate: "K" }, "percent-and-abbreviation"],
    [{ zone: "Mars/Olympus_Mons" }, "unknown-zone"],
  ] as const)("%o is refused as %s", (format, reason) => {
    expect(() => createFormatter(format)).toThrowError(FormatError);
    try {
      createFormatter(format);
    } catch (error) {
      expect((error as FormatError).reason).toBe(reason);
    }
  });
});

test("integers given as numbers must be safe", () => {
  const formatter = createFormatter();
  expect(formatter.integer(1_234)).toBe("1,234");
  expect(() => formatter.integer(2 ** 60)).toThrowError(RangeError);
});

test("booleans read as Excel writes them", () => {
  const formatter = createFormatter();
  expect([formatter.boolean(true), formatter.boolean(false)]).toEqual(["TRUE", "FALSE"]);
});
