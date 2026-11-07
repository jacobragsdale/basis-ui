import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { FormatError, createFormatter } from "#index.ts";
import type { Format, FormatErrorReason, Formatter } from "#index.ts";

// Written by parallax's Rust formatter; see packages/parallax/crates/parallax-engine/tests/format_fixtures.rs.
const fixtures = new URL(
  "../../parallax/crates/parallax-engine/tests/fixtures/format.json",
  import.meta.url,
);

const formatSchema = z.object({
  abbreviate: z.enum(["K", "M", "B"]).nullable(),
  decimals: z.number().nullable(),
  negative: z.enum(["minus", "parentheses"]),
  percent: z.boolean(),
  precision: z.enum(["seconds", "milliseconds", "microseconds"]),
  thousands: z.boolean().nullable(),
  zone: z.string().nullable(),
});

const floatValueSchema = z.union([z.number(), z.enum(["NaN", "inf", "-inf"])]);

const caseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("float"), text: z.string(), value: floatValueSchema }),
  z.object({
    kind: z.literal("decimal"),
    scale: z.number(),
    text: z.string(),
    unscaled: z.string(),
  }),
  z.object({ kind: z.literal("integer"), text: z.string(), value: z.string() }),
  z.object({ days: z.number(), kind: z.literal("date"), text: z.string() }),
  z.object({
    kind: z.literal("timestamp"),
    micros: z.string(),
    text: z.string(),
    zoned: z.boolean(),
  }),
]);

const groupSchema = z.object({ cases: z.array(caseSchema), format: formatSchema });

const fixturesSchema = z.object({ groups: z.array(groupSchema) });

type Case = z.infer<typeof caseSchema>;

const fixtureText: unknown = JSON.parse(readFileSync(fixtures, "utf8"));
const { groups } = fixturesSchema.parse(fixtureText);

function floatOf(value: z.infer<typeof floatValueSchema>): number {
  switch (value) {
    case "NaN": {
      return Number.NaN;
    }
    case "inf": {
      return Number.POSITIVE_INFINITY;
    }
    case "-inf": {
      return Number.NEGATIVE_INFINITY;
    }
    default: {
      return value;
    }
  }
}

function input(item: Case): string {
  switch (item.kind) {
    case "float": {
      return String(item.value);
    }
    case "decimal": {
      return `${item.unscaled}e-${String(item.scale)}`;
    }
    case "integer": {
      return item.value;
    }
    case "date": {
      return `day ${String(item.days)}`;
    }
    case "timestamp": {
      return `${item.micros}µs${item.zoned ? " zoned" : ""}`;
    }
    default: {
      throw new TypeError("The fixture case has an unknown kind.");
    }
  }
}

/** What the formatter writes for a fixture case's value. */
function formatted(formatter: Formatter, item: Case): string {
  switch (item.kind) {
    case "float": {
      return formatter.float(floatOf(item.value));
    }
    case "decimal": {
      return formatter.decimal(BigInt(item.unscaled), item.scale);
    }
    case "integer": {
      return formatter.integer(BigInt(item.value));
    }
    case "date": {
      return formatter.date(item.days);
    }
    case "timestamp": {
      return formatter.timestamp(BigInt(item.micros), item.zoned);
    }
    default: {
      throw new TypeError("The fixture case has an unknown kind.");
    }
  }
}

/** Why `createFormatter` refuses a format, or `undefined` if it accepts it. */
function refusalOf(format: Format): FormatErrorReason | undefined {
  try {
    createFormatter(format);
  } catch (error) {
    if (error instanceof FormatError) {
      return error.reason;
    }
    throw error;
  }
  return undefined;
}

describe.each(groups.map((group) => [JSON.stringify(group.format), group] as const))(
  "the Rust formatter's fixtures, format %s",
  (_name, group) => {
    const formatter = createFormatter(group.format);
    test.each(group.cases.map((item) => [input(item), item] as const))("%s", (_input, item) => {
      expect(formatted(formatter, item)).toBe(item.text);
    });
  },
);

describe("formats that cannot be used", () => {
  test.each([
    [{ decimals: 31 }, "too-many-decimals"],
    [{ decimals: -1 }, "too-many-decimals"],
    [{ decimals: 1.5 }, "too-many-decimals"],
    [{ abbreviate: "K", percent: true }, "percent-and-abbreviation"],
    [{ zone: "Mars/Olympus_Mons" }, "unknown-zone"],
  ] as const)("%o is refused as %s", (format, reason) => {
    expect(() => createFormatter(format)).toThrow(FormatError);
    expect(refusalOf(format)).toBe(reason);
  });
});

test("integers given as numbers must be safe", () => {
  const formatter = createFormatter();
  expect(formatter.integer(1234)).toBe("1,234");
  expect(() => formatter.integer(2 ** 60)).toThrow(RangeError);
});

test("booleans read as Excel writes them", () => {
  const formatter = createFormatter();
  expect([formatter.boolean(true), formatter.boolean(false)]).toEqual(["TRUE", "FALSE"]);
});
