import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { sumPrecise } from "#numbers/index.ts";
import { exactSum } from "#vendor/sum-precise/exact-sum.ts";

// Written by exact rational sums in Python; see the generator's docstring.
const generator = new URL("fixtures/generate_numbers.py", import.meta.url);
const fixtures = new URL("fixtures/numbers.json", import.meta.url);

const double = z.union([z.number(), z.enum(["Infinity", "-Infinity"])]);

const sumCase = z.tuple([z.array(z.number()), double]);
const fixturesSchema = z.object({ generator: z.string(), sumPrecise: z.array(sumCase) });

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

test("the fixtures were written by the generator as it stands", () => {
  const digest = createHash("sha256").update(readFileSync(generator)).digest("hex");
  expect(
    digest,
    "ERROR tests/fixtures/numbers.json is stale: generate_numbers.py changed after it was written. Regenerate it from packages/ui with `uv run tests/fixtures/generate_numbers.py`.",
  ).toBe(cases.generator);
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
