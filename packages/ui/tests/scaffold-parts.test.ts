/* The parts `vp run new` and `vp run fixtures new` are made of: text a pattern matches, a value a schema accepts, the
 * check of a body against its schema as the generated client reads it, and a value written as TypeScript. */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { objectOf } from "#preset/api-operations.ts";
import { literalOf } from "#preset/scaffold-fields.ts";
import { schemaIssues } from "#preset/schema-check.ts";
import { exampleOf } from "#preset/schema-example.ts";
import { textMatching } from "#preset/schema-text.ts";

import { example } from "./fixture-app.ts";

const documentText = readFileSync(path.join(example, "openapi.json"), "utf8");
const document = objectOf(JSON.parse(documentText));
const reference = (name: string): Record<string, string> => ({
  $ref: `#/components/schemas/${name}`,
});

describe("textMatching", () => {
  test.each([
    ["^[A-Z0-9]{12}$", false, "AAAAAAAAAAAA"],
    ["^[A-Z0-9]{12}$", true, "999999999999"],
    [String.raw`^\d{3}-\d{2}$`, false, "000-00"],
    ["^(?:USD|EUR)$", false, "USD"],
    ["^[a-z]+(-[a-z]+)*$", false, "a"],
  ])("makes text %s matches", (pattern, last, text) => {
    expect(textMatching(pattern, last)).toBe(text);
  });

  test("gives nothing for a pattern it cannot satisfy", () => {
    expect(textMatching("^(?!A)A$")).toBeUndefined();
  });
});

describe("exampleOf", () => {
  test("gives every field of a response, each of its type, format and bounds", () => {
    expect(
      exampleOf(document, reference("Settlement"), { every: true, name: "body" }),
    ).toStrictEqual({
      accrued: 1234.5,
      face: 1234.5,
      recorded_at: "2026-11-06T14:30:00Z",
      security_id: "Security id 1",
      settle: "2026-11-06",
      settlement_id: "019a5c3e-0000-7000-8000-000000000001",
    });
  });

  test("gives only the fields a request requires, by their patterns, and a list of one row", () => {
    expect(
      exampleOf(document, reference("SettlementRequest"), { every: false, name: "body" }),
    ).toStrictEqual({ face: 1234.5, security_id: "AAAAAAAAAAAA", settle: "2026-11-06" });
    expect(
      exampleOf(
        document,
        { items: reference("DayCount"), type: "array" },
        { every: true, name: "rows" },
      ),
    ).toStrictEqual([{ convention: "30/360", year_days: 12 }]);
  });

  test("takes a schema's own example, and a number by its display format's kind", () => {
    const schema = {
      properties: {
        rate: { type: "number", "x-basis-format": { kind: "pct" } },
        ticker: { example: "UST10Y", type: "string" },
      },
      type: "object",
    };
    expect(exampleOf(document, schema, { every: true, name: "row" })).toStrictEqual({
      rate: 0.0525,
      ticker: "UST10Y",
    });
  });
});

describe("schemaIssues", () => {
  test("passes a body the schema accepts, with fields it does not declare", () => {
    const row = { convention: "ACT/360", extra: true, year_days: 360 };
    expect(schemaIssues(document, reference("DayCount"), row)).toStrictEqual([]);
  });

  test("names each field a body gets wrong", () => {
    expect(
      schemaIssues(document, { items: reference("DayCount"), type: "array" }, [
        { convention: "ACT/ACT", year_days: 365.5 },
      ]),
    ).toStrictEqual([
      '0.convention: Invalid option: expected one of "30/360"|"ACT/360"|"ACT/365F"',
      "0.year_days: Invalid input: expected int, received number",
    ]);
  });
});

describe("literalOf", () => {
  test("writes a value as TypeScript, its keys bare where they can be and its digits grouped", () => {
    expect(literalOf({ "a-b": [1_250_000, 99.515625], face: -12_345, name: "x" })).toBe(
      '{ "a-b": [1_250_000, 99.515625], face: -12_345, name: "x" }',
    );
  });
});
