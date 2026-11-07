import { describe, expect, test } from "vite-plus/test";

import { parseSecurityIdentifier } from "#securities/index.ts";

describe(parseSecurityIdentifier, () => {
  test("reads each identifier by its length, trimmed and in upper case", () => {
    expect(parseSecurityIdentifier(" 91282crf0 ")).toStrictEqual({
      ok: true,
      value: { kind: "cusip", value: "91282CRF0" },
    });
    expect(parseSecurityIdentifier("US0378331005")).toStrictEqual({
      ok: true,
      value: { kind: "isin", value: "US0378331005" },
    });
    expect(parseSecurityIdentifier("0263494")).toStrictEqual({
      ok: true,
      value: { kind: "sedol", value: "0263494" },
    });
  });

  test("checks the identifier its length names, check digit and all", () => {
    expect(parseSecurityIdentifier("91282CRF1")).toStrictEqual({
      ok: false,
      reason:
        '"91282CRF1" is not a CUSIP: its check digit should be 0; look for a mistyped character.',
    });
    expect(parseSecurityIdentifier("US0378331006")).toStrictEqual({
      ok: false,
      reason:
        '"US0378331006" is not an ISIN: its check digit should be 5; look for a mistyped character.',
    });
  });

  test("names each identifier's length when the text has none of them", () => {
    expect(parseSecurityIdentifier("UST 4 1/4 2034")).toStrictEqual({
      ok: false,
      reason:
        '"UST 4 1/4 2034" is not a CUSIP, an ISIN, or a SEDOL: a CUSIP has 9 characters, an ISIN 12, and a SEDOL 7, not 14.',
    });
    expect(parseSecurityIdentifier("91282")).toStrictEqual({
      ok: false,
      reason:
        '"91282" is not a CUSIP, an ISIN, or a SEDOL: a CUSIP has 9 characters, an ISIN 12, and a SEDOL 7, not 5.',
    });
  });

  test("takes only the kinds it is given", () => {
    expect(parseSecurityIdentifier("0263494", ["cusip"])).toStrictEqual({
      ok: false,
      reason: '"0263494" is not a CUSIP: a CUSIP has 9 characters, not 7.',
    });
    expect(parseSecurityIdentifier("037833100", ["cusip", "isin"]).ok).toBe(true);
  });
});
