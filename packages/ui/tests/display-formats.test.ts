import { describe, expect, test } from "vite-plus/test";

import { readDisplayFormat } from "#index.ts";
import { displayFormatsModule, displayFormatsOf } from "#preset/display-formats.ts";

describe(readDisplayFormat, () => {
  test.each([
    [
      { decimals: 4, kind: "price" },
      { decimals: 4, kind: "price" },
    ],
    ['{"kind":"price","decimals":4}', { decimals: 4, kind: "price" }],
    [
      { currency: "EUR", kind: "money" },
      { currency: "EUR", kind: "money" },
    ],
    [{ kind: "pct" }, { kind: "pct" }],
    [
      { decimals: 1, kind: "bps" },
      { decimals: 1, kind: "bps" },
    ],
    [
      { kind: "price32", step: "half" },
      { kind: "price32", step: "half" },
    ],
    [
      { decimals: 2, kind: "number", tooltip: "later" },
      { decimals: 2, kind: "number" },
    ],
  ])("reads %j", (declared, format) => {
    expect(readDisplayFormat(declared)).toStrictEqual(format);
  });

  test.each([
    ["an unknown kind", { kind: "duration" }],
    ["decimals past 15", { decimals: 16, kind: "number" }],
    ["a currency that is no ISO 4217 code", { currency: "dollars", kind: "money" }],
    ["a step price32 does not take", { kind: "price32", step: "tick" }],
    ["text that is not JSON", "price, 4"],
    ["nothing", undefined],
  ])("is no format for %s", (_name, declared) => {
    expect(readDisplayFormat(declared)).toBeUndefined();
  });
});

describe(displayFormatsOf, () => {
  const document = {
    components: {
      schemas: {
        Bond: { properties: { coupon_rate: { type: "number" }, security_id: { type: "string" } } },
        CouponRow: {
          properties: {
            interest: { type: "number", "x-basis-format": { decimals: 4, kind: "price" } },
            spread: {
              anyOf: [{ type: "number", "x-basis-format": { kind: "bps" } }, { type: "null" }],
            },
            tenor: { type: "number", "x-basis-format": { kind: "duration" } },
          },
        },
      },
    },
  };

  test("lists each formatted property by schema, nullable ones included, and leaves out what it cannot read", () => {
    expect(displayFormatsOf(document)).toStrictEqual({
      CouponRow: { interest: { decimals: 4, kind: "price" }, spread: { kind: "bps" } },
    });
  });

  test("writes a module the generated client exports as displayFormats", () => {
    const text = displayFormatsModule(document);
    expect(text).toContain("export const displayFormats = {");
    expect(text).toContain('import type { DisplayFormat } from "@basis/ui";');
    expect(text).toContain('"kind": "bps"');
  });

  test("is empty for a document with no formats", () => {
    expect(displayFormatsOf({ openapi: "3.1.0" })).toStrictEqual({});
  });
});
