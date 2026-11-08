/* Treasury prices in 32nds, as US cash markets quote them: `99-16` is 99 and 16/32, `99-16+` adds half a 32nd, and
 * a third digit counts eighths of a 32nd, so `99-162` is 99 and 16 2/8 of 32, or 99.5078125.
 *
 * The third digit is always eighths here. CME's quotes for Treasury futures use a different third digit, the 32nd's
 * decimal fraction truncated (`-165` for 16.5, `-167` for 16.75), which these functions do not read or write. */

import { parseDecimal, powerOfTen } from "./decimal-text.ts";
import { defaultRounding, divideRounded } from "./rounding.ts";
import type { Rounding } from "./rounding.ts";

/** The finest step shown: a 32nd, or a half, quarter or eighth of one. */
type ThirtySecondsPrecision = "thirty-seconds" | "halves" | "quarters" | "eighths";

interface ThirtySecondsFormat {
  /** Eighths of a 32nd, the finest, unless set. */
  readonly precision?: ThirtySecondsPrecision;
  /** How a price between steps rounds: half away from zero unless set. */
  readonly rounding?: Rounding;
}

/** A price read from typed text, or why it cannot be read. */
type ThirtySecondsResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: string };

const none = 0n;
const thirtySecondsPerPoint = 32n;
const eighthsPerThirtySecond = 8n;
const eighthsPerPoint = 256n;
/** Four eighths are a half, written `+`. */
const halfInEighths = 4n;
/** A double price is read at 8 decimals before it is rounded to a step, so 99.51562499999999 reads as 99.515625. */
const priceDecimals = 8;

const stepsPerThirtySecond: Readonly<Record<ThirtySecondsPrecision, bigint>> = {
  "thirty-seconds": 1n,
  halves: 2n,
  quarters: 4n,
  eighths: 8n,
};

const priceShape = /^(?<sign>-?)(?<whole>\d+)(?:-(?<ticks>\d\d)(?<eighth>[0-7+]?))?$/u;

function eighthMark(eighth: bigint): string {
  if (eighth === none) {
    return "";
  }
  return eighth === halfInEighths ? "+" : eighth.toString();
}

/** Writes a price held as a count of 256ths of a point. */
function eighthsText(eighths: bigint): string {
  const negative = eighths < none;
  const size = negative ? -eighths : eighths;
  const rest = size % eighthsPerPoint;
  const ticks = (rest / eighthsPerThirtySecond).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${String(size / eighthsPerPoint)}-${ticks}${eighthMark(rest % eighthsPerThirtySecond)}`;
}

/** An exact price, `unscaled × 10^-scale`, as the formatter holds one. */
interface ExactPrice {
  readonly unscaled: bigint;
  readonly scale: number;
}

/** A double price read at its shortest digits, as `String` writes them, then at 8 decimals, rounded half away from
 * zero: 99.51562499999999 reads as 99.515625, and a price past 2^53 keeps the digits it prints with. */
function priceAt8(price: number): ExactPrice {
  const { scale, unscaled } = parseDecimal(String(price));
  if (scale <= priceDecimals) {
    return { scale: priceDecimals, unscaled: unscaled * powerOfTen(priceDecimals - scale) };
  }
  const at8 = divideRounded(unscaled, powerOfTen(scale - priceDecimals), "half-away-from-zero");
  return { scale: priceDecimals, unscaled: at8 };
}

/** Writes an exact price in 32nds, rounded to the precision's step by `rounding`. */
function exactThirtySeconds(
  { unscaled, scale }: ExactPrice,
  { precision = "eighths", rounding = defaultRounding }: ThirtySecondsFormat = {},
): string {
  const stepsPerPoint = thirtySecondsPerPoint * stepsPerThirtySecond[precision];
  const steps =
    scale < 0
      ? unscaled * powerOfTen(-scale) * stepsPerPoint
      : divideRounded(unscaled * stepsPerPoint, powerOfTen(scale), rounding);
  return eighthsText(steps * (eighthsPerPoint / stepsPerPoint));
}

/** Writes a price in 32nds: `99-16`, `99-16+`, `99-162`, and `-0-04+` for a negative change. The price is read at 8
 * decimals, then rounded to the precision's step, so `formatThirtySeconds(price, { precision: "halves" })` shows only
 * `99-16` or `99-16+`. */
function formatThirtySeconds(price: number, format: ThirtySecondsFormat = {}): string {
  return exactThirtySeconds(priceAt8(price), format);
}

function refuse(reason: string): ThirtySecondsResult {
  return { ok: false, reason };
}

/** The 256ths of a point in a price's 32nds and its eighth, or `+` for a half; `undefined` past 31 32nds. */
function eighthsWithin(ticks: string, mark: string): bigint | undefined {
  const thirtySeconds = BigInt(ticks || "0");
  if (thirtySeconds >= thirtySecondsPerPoint) {
    return undefined;
  }
  const eighth = mark === "+" ? halfInEighths : BigInt(mark || "0");
  return thirtySeconds * eighthsPerThirtySecond + eighth;
}

/** Reads a price typed in 32nds, `99-16`, `99-16+`, `99-162` or `99-164` (the same as `99-16+`), or a whole number
 * of points such as `100`, into its value: `99-16+` is 99.515625, which a double holds exactly. */
function parseThirtySeconds(text: string): ThirtySecondsResult {
  const groups = priceShape.exec(text.trim())?.groups;
  const whole = groups?.["whole"];
  if (groups === undefined || whole === undefined) {
    return refuse(
      `"${text}" is not a price in 32nds: write it as 99-16, 99-16+ for a half, or 99-162 for eighths.`,
    );
  }
  const within = eighthsWithin(groups["ticks"] ?? "", groups["eighth"] ?? "");
  if (within === undefined) {
    return refuse(`"${text}" has more than 31 32nds: a point has 32, so write 00 to 31.`);
  }
  // A count of 256ths is exact as a double for any price a desk quotes.
  const size = Number(BigInt(whole) * eighthsPerPoint + within) / Number(eighthsPerPoint);
  return { ok: true, value: groups["sign"] === "-" ? -size : size };
}

export { exactThirtySeconds, formatThirtySeconds, parseThirtySeconds };
export type { ExactPrice, ThirtySecondsFormat, ThirtySecondsPrecision, ThirtySecondsResult };
