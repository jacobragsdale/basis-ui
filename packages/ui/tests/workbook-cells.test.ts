/* What an Excel cell's stored number reads as: Excel's 15 digits, and the date, time or number its format shows. */

import { describe, expect, test } from "vite-plus/test";

import { numberKind, numberText } from "#utils/workbook-cells.ts";

describe(numberText, () => {
  test("gives Excel's 15 significant digits, written out without an exponent", () => {
    expect(numberText(0.1 + 0.2, "0.30000000000000004")).toBe("0.3");
    expect(numberText(90.96599999999999, "90.96599999999999")).toBe("90.966");
    expect(numberText(1_234_567_890.123457, "1234567890.1234567")).toBe("1234567890.12346");
    expect(numberText(1e-7, "1E-7")).toBe("0.0000001");
    expect(numberText(-2.5e-10, "-2.5E-10")).toBe("-0.00000000025");
    expect(numberText(1e21, "1E+21")).toBe("1000000000000000000000");
    expect(numberText(-0, "-0")).toBe("0");
    expect(numberText(1_000_000, "1000000")).toBe("1000000");
  });
});

describe(numberKind, () => {
  test("tells dates and times from numbers by the format's code", () => {
    const kinds = {
      "#,##0;[Red]-#,##0": "number",
      "0.00%": "number",
      "0.00E+00": "number",
      '"Ref "0': "number",
      "[h]:mm:ss": "number",
      General: "number",
      "@": "number",
      "_($* #,##0.00_)": "number",
      "yyyy-mm-dd": "date",
      "[$-409]mmmm d, yyyy": "date",
      "mmm-yy": "date",
      "h:mm AM/PM": "time",
      "mm:ss": "time",
      "m/d/yy h:mm": "dateTime",
    } as const;
    for (const [code, kind] of Object.entries(kinds)) {
      expect([code, numberKind(164, code)]).toStrictEqual([code, kind]);
    }
    expect([14, 18, 22, 46, 2].map((id) => numberKind(id))).toStrictEqual([
      "date",
      "time",
      "dateTime",
      "number",
      "number",
    ]);
  });
});
