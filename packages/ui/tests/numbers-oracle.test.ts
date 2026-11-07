import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { Decimal, sumPrecise } from "#numbers/index.ts";
import { exactSum } from "#vendor/sum-precise/exact-sum.ts";

// Written by Python's decimal module and exact rational sums; see the generator's docstring.
const generator = new URL("fixtures/generate_numbers.py", import.meta.url);
const fixtures = new URL("fixtures/numbers.json", import.meta.url);

const rounding = z.enum([
  "half-away-from-zero",
  "half-even",
  "toward-zero",
  "away-from-zero",
  "floor",
  "ceiling",
]);
const text = z.string();
const count = z.number();
const binary = z.array(z.tuple([text, text, text]));
const double = z.union([z.number(), z.enum(["Infinity", "-Infinity"])]);
const ordering = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const texts = z.array(text);
const doubleList = z.array(z.number());
const doubleCase = z.tuple([z.number(), count, rounding, text]);
const nearestCase = z.tuple([text, z.number()]);

const fixturesSchema = z.object({
  generator: z.string(),
  parse: z.array(z.tuple([text, text])),
  invalid: z.array(text),
  add: binary,
  sub: binary,
  mul: binary,
  compare: z.array(z.tuple([text, text, ordering])),
  div: z.array(z.tuple([text, text, count, rounding, text])),
  round: z.array(z.tuple([text, count, rounding, text])),
  sum: z.array(z.tuple([texts, text])),
  fromNumber: z.array(doubleCase),
  toNumber: z.array(nearestCase),
  sumPrecise: z.array(z.tuple([doubleList, double])),
});

const fixtureText: unknown = JSON.parse(readFileSync(fixtures, "utf8"));
const cases = fixturesSchema.parse(fixtureText);

/** A double as text that tells -0 from 0; `String` writes the shortest digits that read back to the same double. */
function doubleText(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

function expectedDouble(value: z.infer<typeof double>): number {
  if (value === "Infinity") {
    return Number.POSITIVE_INFINITY;
  }
  return value === "-Infinity" ? Number.NEGATIVE_INFINITY : value;
}

/** Python's decimal syntax error, `SyntaxError` here, or `undefined` when the text reads. */
function refusal(input: string): string | undefined {
  try {
    Decimal.from(input);
    return undefined;
  } catch (error) {
    return error instanceof SyntaxError ? "SyntaxError" : String(error);
  }
}

test("the fixtures were written by the generator as it stands", () => {
  const digest = createHash("sha256").update(readFileSync(generator)).digest("hex");
  expect(
    digest,
    "ERROR tests/fixtures/numbers.json is stale: generate_numbers.py changed after it was written. Regenerate it from packages/ui with `uv run tests/fixtures/generate_numbers.py`.",
  ).toBe(cases.generator);
});

describe("Decimal agrees with Python's decimal module", () => {
  test("reading and writing text", () => {
    const read = cases.parse.map(([input]) => `${input} → ${Decimal.from(input).toString()}`);
    expect(read).toEqual(cases.parse.map(([input, written]) => `${input} → ${written}`));
  });

  test("refusing what is not a decimal number", () => {
    const refused = cases.invalid.map((input) => `${input}: ${String(refusal(input))}`);
    expect(refused).toEqual(cases.invalid.map((input) => `${input}: SyntaxError`));
  });

  test.each([
    {
      name: "add",
      operate: (left: Decimal, right: Decimal): Decimal => left.add(right),
      operations: cases.add,
      symbol: "+",
    },
    {
      name: "sub",
      operate: (left: Decimal, right: Decimal): Decimal => left.sub(right),
      operations: cases.sub,
      symbol: "-",
    },
    {
      name: "mul",
      operate: (left: Decimal, right: Decimal): Decimal => left.mul(right),
      operations: cases.mul,
      symbol: "×",
    },
  ])("$name", ({ operate, operations, symbol }) => {
    const results = operations.map(([left, right]) => {
      const result = operate(Decimal.from(left), Decimal.from(right));
      return `${left} ${symbol} ${right} = ${result.toString()}`;
    });
    expect(results).toEqual(
      operations.map(([left, right, result]) => `${left} ${symbol} ${right} = ${result}`),
    );
  });

  test("compare and equals", () => {
    const compared = cases.compare.map(([left, right]) => {
      const first = Decimal.from(left);
      const second = Decimal.from(right);
      return `${left} vs ${right}: ${String(first.compare(second))} ${String(first.equals(second))}`;
    });
    expect(compared).toEqual(
      cases.compare.map(
        ([left, right, order]) => `${left} vs ${right}: ${String(order)} ${String(order === 0)}`,
      ),
    );
  });

  test("division at a scale, in every rounding mode", () => {
    const quotients = cases.div.map(([left, right, scale, mode]) => {
      const quotient = Decimal.from(left).div(Decimal.from(right), { rounding: mode, scale });
      return `${left} / ${right} at ${String(scale)} ${mode} = ${quotient.toString()}`;
    });
    expect(quotients).toEqual(
      cases.div.map(
        ([left, right, scale, mode, result]) =>
          `${left} / ${right} at ${String(scale)} ${mode} = ${result}`,
      ),
    );
  });

  test("rounding to a scale, ties included, in every rounding mode", () => {
    const roundings = cases.round.map(
      ([value, scale, mode]) =>
        `${value} at ${String(scale)} ${mode} = ${Decimal.from(value).round(scale, mode).toString()}`,
    );
    expect(roundings).toEqual(
      cases.round.map(
        ([value, scale, mode, result]) => `${value} at ${String(scale)} ${mode} = ${result}`,
      ),
    );
  });

  test("sums of lists", () => {
    const sums = cases.sum.map(
      ([values]) =>
        `${values.join(" + ")} = ${Decimal.sum(values.map((value) => Decimal.from(value))).toString()}`,
    );
    expect(sums).toEqual(cases.sum.map(([values, total]) => `${values.join(" + ")} = ${total}`));
  });

  test("doubles read through their shortest decimal, then rounded once", () => {
    const read = cases.fromNumber.map(
      ([value, scale, mode]) =>
        `${String(value)} at ${String(scale)} ${mode} = ${Decimal.fromNumber(value, scale, mode).toString()}`,
    );
    expect(read).toEqual(
      cases.fromNumber.map(
        ([value, scale, mode, result]) =>
          `${String(value)} at ${String(scale)} ${mode} = ${result}`,
      ),
    );
  });

  test("the nearest double, for charts", () => {
    const doubles = cases.toNumber.map(
      ([value]) => `${value} ≈ ${doubleText(Decimal.from(value).toNumber())}`,
    );
    expect(doubles).toEqual(
      cases.toNumber.map(([value, nearest]) => `${value} ≈ ${doubleText(nearest)}`),
    );
  });
});

describe("sumPrecise agrees with the exact sum rounded once", () => {
  const expected = cases.sumPrecise.map(
    ([values, total]) =>
      `${values.map((value) => doubleText(value)).join(" + ")} = ${doubleText(expectedDouble(total))}`,
  );

  test.each([
    ["the fallback", exactSum],
    ["sumPrecise", sumPrecise],
  ])("%s", (_name, sum) => {
    const sums = cases.sumPrecise.map(
      ([values]) =>
        `${values.map((value) => doubleText(value)).join(" + ")} = ${doubleText(sum(values))}`,
    );
    expect(sums).toEqual(expected);
  });
});
