import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import {
  cusipToIsin,
  isCusip,
  isIsin,
  isSedol,
  parseCusip,
  parseIsin,
  parseSedol,
} from "#securities/index.ts";
import type { Cusip } from "#securities/index.ts";

// Published identifiers: Treasuries from TreasuryDirect, and the standards' worked examples, with their sources.
const codeSchema = z.object({ code: z.string(), security: z.string() });
const isinSchema = codeSchema.extend({
  cusip: z.string().optional(),
  sedol: z.string().optional(),
});
const undetectedSchema = z.object({ code: z.string(), note: z.string() });
const examplesSchema = z.object({
  fetched: z.iso.date(),
  isins: z.array(isinSchema),
  sedols: z.array(codeSchema),
  title: z.string(),
  undetected: z.array(undetectedSchema),
  urls: z.array(z.url()),
});
const treasurySourceSchema = z.object({
  cusips: z.array(codeSchema),
  fetched: z.iso.date(),
  title: z.string(),
  url: z.url(),
});
const fixturesSchema = z.object({
  examples: examplesSchema,
  treasuries: z.array(treasurySourceSchema),
});
const fixtureText: unknown = JSON.parse(
  readFileSync(new URL("fixtures/securities.json", import.meta.url), "utf8"),
);
const fixtures = fixturesSchema.parse(fixtureText);

const treasuries = fixtures.treasuries.flatMap((source) => source.cusips);
const { isins, sedols, undetected } = fixtures.examples;

function cusip(text: string): Cusip {
  const reading = parseCusip(text);
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return reading.value;
}

/** Every code one character away from `code`, with its last character changed to each other digit. */
function wrongCheckDigits(code: string): string[] {
  return ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
    .filter((digit) => digit !== code.at(-1))
    .map((digit) => `${code.slice(0, -1)}${digit}`);
}

describe("CUSIPs", () => {
  test.each(treasuries.map((treasury) => [treasury.code, treasury.security] as const))(
    "Treasury %s (%s) is a CUSIP",
    (code) => {
      expect(isCusip(code)).toBe(true);
      expect(parseCusip(code)).toStrictEqual({ ok: true, value: code });
    },
  );

  test("Apple's CUSIP, the ISIN standard's example, is a CUSIP", () => {
    expect(isCusip("037833100")).toBe(true);
  });

  test.each(treasuries.map((treasury) => treasury.code))(
    "every other check digit fails %s",
    (code) => {
      expect(wrongCheckDigits(code).filter((wrong) => isCusip(wrong))).toStrictEqual([]);
    },
  );

  test("a wrong check digit names the right one", () => {
    expect(parseCusip("91282CRF1")).toStrictEqual({
      ok: false,
      reason:
        '"91282CRF1" is not a CUSIP: its check digit should be 0; look for a mistyped character.',
    });
  });

  test("counts *, @ and # as 36, 37 and 38", () => {
    // Worked by hand: 0 6 7 7 3 6 9 11 sums to 49, so the check digit is 1.
    expect(isCusip("037833*@1")).toBe(true);
    expect(isCusip("037833*@2")).toBe(false);
  });

  test.each([
    ["91282CRF", "has 9 characters, not 8"],
    ["91282CRF00", "has 9 characters, not 10"],
    ["91282CRFX", "ends in a digit"],
    ["91282-RF0", "takes letters, digits"],
  ])("refuses %s: it %s", (code, reason) => {
    const reading = parseCusip(code);
    expect(reading.ok ? "" : reading.reason).toContain(reason);
  });

  test("parsing trims and reads upper case; isCusip takes the text as given", () => {
    expect(parseCusip(" 91282crf0 ")).toStrictEqual({ ok: true, value: "91282CRF0" });
    expect(isCusip("91282crf0")).toBe(false);
  });

  test("a ticker is not a CUSIP", () => {
    expect(isCusip("AAPL")).toBe(false);
  });
});

describe("ISINs", () => {
  test.each(isins.map((isin) => [isin.code, isin.security] as const))(
    "%s (%s) is an ISIN",
    (code) => {
      expect(isIsin(code)).toBe(true);
      expect(parseIsin(code)).toStrictEqual({ ok: true, value: code });
    },
  );

  test.each(isins.map((isin) => isin.code))("every other check digit fails %s", (code) => {
    expect(wrongCheckDigits(code).filter((wrong) => isIsin(wrong))).toStrictEqual([]);
  });

  test.each(undetected.map((code) => [code.code, code.note] as const))(
    "%s passes, as the standard warns: %s",
    (code) => {
      expect(isIsin(code)).toBe(true);
    },
  );

  test("a wrong check digit names the right one", () => {
    expect(parseIsin("US0378331004")).toStrictEqual({
      ok: false,
      reason:
        '"US0378331004" is not an ISIN: its check digit should be 5; look for a mistyped character.',
    });
  });

  test.each([
    ["US037833100", "has 12 characters, not 11"],
    ["1S0378331005", "two-letter country code"],
    ["US037833100X", "ends in a digit"],
  ])("refuses %s: it %s", (code, reason) => {
    const reading = parseIsin(code);
    expect(reading.ok ? "" : reading.reason).toContain(reason);
  });
});

describe("cusipToIsin", () => {
  test.each(
    isins
      .filter((isin) => isin.cusip !== undefined)
      .map((isin) => [isin.cusip ?? "", isin.code] as const),
  )("%s is %s", (code, expected) => {
    expect(cusipToIsin(cusip(code))).toBe(expected);
  });

  test.each(treasuries.map((treasury) => treasury.code))(
    "Treasury %s becomes a US ISIN",
    (code) => {
      const isin = cusipToIsin(cusip(code));
      expect(isin.slice(0, 2 + code.length)).toBe(`US${code}`);
      expect(isIsin(isin)).toBe(true);
    },
  );

  test("a Canadian issue takes CA", () => {
    expect(cusipToIsin(cusip("037833100"), "CA").startsWith("CA037833100")).toBe(true);
  });

  test("refuses a country code that is not two letters", () => {
    expect(() => cusipToIsin(cusip("037833100"), "U1")).toThrow(RangeError);
  });
});

describe("SEDOLs", () => {
  test.each(sedols.map((sedol) => [sedol.code, sedol.security] as const))(
    "%s (%s) is a SEDOL",
    (code) => {
      expect(isSedol(code)).toBe(true);
      expect(parseSedol(code)).toStrictEqual({ ok: true, value: code });
    },
  );

  test("the SEDOL inside BAE Systems' ISIN is the one listed", () => {
    const bae = isins.find((isin) => isin.sedol !== undefined);
    expect(bae?.code.slice(4, 11)).toBe(bae?.sedol);
  });

  test("every other check digit fails 0263494", () => {
    expect(wrongCheckDigits("0263494").filter((wrong) => isSedol(wrong))).toStrictEqual([]);
  });

  test("refuses a vowel, which no SEDOL contains", () => {
    const reading = parseSedol("A263494");
    expect(reading.ok ? "" : reading.reason).toContain("digits and consonants");
  });

  test("a wrong check digit names the right one", () => {
    expect(parseSedol("0263495")).toStrictEqual({
      ok: false,
      reason:
        '"0263495" is not a SEDOL: its check digit should be 4; look for a mistyped character.',
    });
  });
});

describe("the branded types", () => {
  test("a parsed CUSIP is typed as one, and a plain string is not", () => {
    const reading = parseCusip("91282CRF0");
    const value: Cusip | undefined = reading.ok ? reading.value : undefined;
    // @ts-expect-error -- a string is not a Cusip until parseCusip has checked it.
    const unchecked: Cusip = "91282CRF0";
    expect([value, unchecked]).toStrictEqual(["91282CRF0", "91282CRF0"]);
  });
});
