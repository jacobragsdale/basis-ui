import { describe, expect, test } from "vite-plus/test";

import { formatThirtySeconds, parseThirtySeconds } from "#numbers/index.ts";

const eighthsPerPoint = 256;

/** `whole + eighths / 256`, which a double holds exactly, computed apart from the code under test. */
function price(whole: number, eighths: number): number {
  return whole + eighths / eighthsPerPoint;
}

/** How the convention writes `whole` and `eighths` 256ths: 32nds in two digits, then `+` for four eighths, or the
 * count of eighths. */
function quoted(whole: number, eighths: number): string {
  const thirtySeconds = String(Math.floor(eighths / 8)).padStart(2, "0");
  const eighth = eighths % 8;
  const marks = ["", "1", "2", "3", "+", "5", "6", "7"];
  return `${String(whole)}-${thirtySeconds}${marks[eighth] ?? ""}`;
}

function parsed(text: string): string {
  const result = parseThirtySeconds(text);
  return result.ok ? String(result.value) : result.reason;
}

describe("published examples", () => {
  test.each([
    // FINRA's Series 7 material: 99-16 is 99 and 16/32, $995 per $1,000 of par.
    ["99-16", "99.5"],
    // 31 CFR 375.13(b), the Treasury's 2002 buyback rule: 102.172 is 102 and 17/32 and 2/8 of a 32nd, 102.5390625.
    ["102-172", "102.5390625"],
    // CME's Treasury futures price rounding conventions: 116-27+ is 116 and 27.5/32.
    ["116-27+", "116.859375"],
    ["99-16+", "99.515625"],
    ["99-162", "99.5078125"],
    ["100-00", "100"],
  ])("%s is %s", (text, value) => {
    expect(parsed(text)).toBe(value);
    expect(formatThirtySeconds(Number(value))).toBe(text);
  });
});

test("every 256th from 99 to 101 is written by the convention and reads back exactly", () => {
  const steps = Array.from({ length: 2 * eighthsPerPoint + 1 }, (_entry, step) => step);
  const written = steps.map((step) => formatThirtySeconds(price(99, step)));
  const expected = steps.map((step) =>
    quoted(99 + Math.floor(step / eighthsPerPoint), step % eighthsPerPoint),
  );
  expect(written).toEqual(expected);
  const readBack = expected.map((text) => parsed(text));
  expect(readBack).toEqual(steps.map((step) => String(price(99, step))));
});

describe("formatting", () => {
  test("rounds to the precision's step", () => {
    const value = 99.5078125;
    expect(formatThirtySeconds(value, { precision: "quarters" })).toBe("99-162");
    expect(formatThirtySeconds(99.51171875, { precision: "halves" })).toBe("99-16+");
    expect(formatThirtySeconds(99.51171875, { precision: "thirty-seconds" })).toBe("99-16");
    expect(formatThirtySeconds(99.99, { precision: "thirty-seconds" })).toBe("100-00");
  });

  test("rounds a price between steps half away from zero unless told otherwise", () => {
    // 16.25/32 is a tie between 16 and 16.5 at halves.
    expect(formatThirtySeconds(99.5078125, { precision: "halves" })).toBe("99-16+");
    expect(
      formatThirtySeconds(99.5078125, {
        precision: "halves",
        rounding: "half-even",
      }),
    ).toBe("99-16");
    expect(formatThirtySeconds(99.5, { precision: "halves" })).toBe("99-16");
    expect(formatThirtySeconds(99.50390625, { precision: "quarters" })).toBe("99-162");
    expect(
      formatThirtySeconds(99.50390625, {
        precision: "quarters",
        rounding: "floor",
      }),
    ).toBe("99-16");
  });

  /* 1/512 is half an eighth of a 32nd: 99.001953125 is an exact tie between 99-00 and 99-001, which a read at 8
   * decimals turned into 99.00195313, past the tie. */
  test.each([
    ["half-even", "99-00"],
    ["half-away-from-zero", "99-001"],
    ["floor", "99-00"],
    ["ceiling", "99-001"],
  ] as const)(
    "keeps an exact tie at half an eighth a tie, rounding it %s to %s",
    (rounding, text) => {
      expect(formatThirtySeconds(99.001953125, { rounding })).toBe(text);
    },
  );

  test("still reads a double's noise at its digits, not as a tie", () => {
    expect(formatThirtySeconds(99.51562499999999)).toBe("99-16+");
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "writes %s as the formatter's dash, never throwing",
    (value) => {
      expect(formatThirtySeconds(value)).toBe("—");
    },
  );

  test("writes negative changes with a sign, and zero without one", () => {
    expect(formatThirtySeconds(-0.140625)).toBe("-0-04+");
    expect(formatThirtySeconds(-1.25)).toBe("-1-08");
    expect(formatThirtySeconds(-0.001)).toBe("0-00");
  });
});

describe("parsing", () => {
  test.each([
    ["99-164", "99.515625"],
    ["99-160", "99.5"],
    [" 99-16 ", "99.5"],
    ["100", "100"],
    ["-0-04+", "-0.140625"],
    ["0-31", "0.96875"],
  ])("%s reads as %s", (text, value) => {
    expect(parsed(text)).toBe(value);
  });

  test.each([
    ["99-32", '"99-32" has more than 31 32nds: a point has 32, so write 00 to 31.'],
    [
      "99-1",
      '"99-1" is not a price in 32nds: write it as 99-16, 99-16+ for a half, or 99-162 for eighths.',
    ],
    [
      "99-168",
      '"99-168" is not a price in 32nds: write it as 99-16, 99-16+ for a half, or 99-162 for eighths.',
    ],
    [
      "99.5",
      '"99.5" is not a price in 32nds: write it as 99-16, 99-16+ for a half, or 99-162 for eighths.',
    ],
    [
      "99:16",
      '"99:16" is not a price in 32nds: write it as 99-16, 99-16+ for a half, or 99-162 for eighths.',
    ],
    [
      "",
      '"" is not a price in 32nds: write it as 99-16, 99-16+ for a half, or 99-162 for eighths.',
    ],
  ])("%j is refused", (text, reason) => {
    expect(parseThirtySeconds(text)).toEqual({ ok: false, reason });
  });
});
