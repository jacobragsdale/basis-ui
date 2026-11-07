/* Treasury prices in 32nds, as US cash markets quote them: `99-16` is 99 and 16/32, `99-16+` adds half a 32nd, and
 * a third digit counts eighths of a 32nd, so `99-162` is 99 and 16 2/8 of 32, or 99.5078125.
 *
 * The third digit is always eighths here. CME's quotes for Treasury futures use a different third digit, the 32nd's
 * decimal fraction truncated (`-165` for 16.5, `-167` for 16.75), which these functions do not read or write. */

import { Decimal } from "./decimal.ts";
import { defaultRounding } from "./rounding.ts";
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
  | { readonly ok: true; readonly value: Decimal }
  | { readonly ok: false; readonly reason: string };

const none = 0n;
const thirtySecondsPerPoint = 32n;
const eighthsPerThirtySecond = 8n;
const eighthsPerPoint = 256n;
/** Four eighths are a half, written `+`. */
const halfInEighths = 4n;
/** 1/256 is 0.00390625: 390625 × 10^-8. */
const eighthDigits = 390_625n;
const eighthScale = 8;

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

/** A count of 256ths of a point as a Decimal, at the fewest digits that hold it exactly. */
function fromEighths(eighths: bigint): Decimal {
  const exact = Decimal.from(eighths * eighthDigits, eighthScale);
  for (let scale = 0; scale < eighthScale; scale += 1) {
    const shorter = exact.round(scale, "toward-zero");
    if (shorter.equals(exact)) {
      return shorter;
    }
  }
  return exact;
}

/** Writes a price in 32nds: `99-16`, `99-16+`, `99-162`, and `-0-04+` for a negative change. The price is first
 * rounded to the precision's step, so `formatThirtySeconds(price, { precision: "halves" })` shows only `99-16` or
 * `99-16+`. */
function formatThirtySeconds(
  price: Decimal,
  { precision = "eighths", rounding = defaultRounding }: ThirtySecondsFormat = {},
): string {
  const stepsPerPoint = thirtySecondsPerPoint * stepsPerThirtySecond[precision];
  const steps = price.mul(Decimal.from(stepsPerPoint)).round(0, rounding).unscaled;
  return eighthsText(steps * (eighthsPerPoint / stepsPerPoint));
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
 * of points such as `100`, into its exact value: `99-16+` is 99.515625. */
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
  const size = BigInt(whole) * eighthsPerPoint + within;
  return { ok: true, value: fromEighths(groups["sign"] === "-" ? -size : size) };
}

export { formatThirtySeconds, parseThirtySeconds };
export type { ThirtySecondsFormat, ThirtySecondsPrecision, ThirtySecondsResult };
