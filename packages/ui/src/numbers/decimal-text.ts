// Decimal text to and from an unscaled integer and a scale, with no rounding either way.

/** An exact decimal: `unscaled × 10^-scale`, with a scale of zero or more. */
interface Scaled {
  readonly unscaled: bigint;
  readonly scale: number;
}

const zero = 0n;
const ten = 10n;

/** The largest exponent a decimal string may carry. `1e100000` would otherwise make a hundred-thousand-digit integer
 * and stall the page; no price, rate or amount comes near it. */
const maxExponent = 10_000;

/** What Python's `Decimal` and JavaScript's `String(number)` write: digits with an optional point and exponent. */
const decimalShape =
  /^(?<sign>[+-]?)(?<whole>\d*)(?:\.(?<fraction>\d*))?(?:[eE](?<exponent>[+-]?\d+))?$/u;

/** Returns `scale` if it is a count of digits from 0, and throws `RangeError` if not. */
function checkedScale(scale: number): number {
  if (!Number.isSafeInteger(scale) || scale < 0) {
    throw new RangeError(`A scale of ${String(scale)} is not a count of digits from 0.`);
  }
  return scale;
}

function powerOfTen(places: number): bigint {
  return ten ** BigInt(places);
}

/** The digits, point and exponent of decimal text, or `undefined` when it is not decimal text. */
function partsOf(text: string): { readonly digits: string; readonly places: number } | undefined {
  const groups = decimalShape.exec(text)?.groups;
  const whole = groups?.["whole"] ?? "";
  const fraction = groups?.["fraction"] ?? "";
  if (groups === undefined || whole + fraction === "") {
    return undefined;
  }
  const exponent = Number(groups["exponent"] ?? "0");
  if (Math.abs(exponent) > maxExponent) {
    throw new RangeError(
      `"${text}" has an exponent past ±${String(maxExponent)}; write the number without one.`,
    );
  }
  return {
    digits: `${groups["sign"] ?? ""}${whole}${fraction}`,
    places: fraction.length - exponent,
  };
}

/** Reads decimal text such as `-1234.50`, `.5` or `1.5E+3` exactly. A positive exponent becomes trailing zeros, so
 * the scale is never negative: `1.5E+3` reads as 1500 at scale 0. Throws `SyntaxError` for anything else, including
 * surrounding space, `NaN` and `Infinity`, and `RangeError` for an exponent past ±10,000. */
function parseDecimal(text: string): Scaled {
  const parts = partsOf(text);
  if (parts === undefined) {
    throw new SyntaxError(
      `"${text}" is not a decimal number; write one such as 1234.5 or -0.0025.`,
    );
  }
  const digits = BigInt(parts.digits);
  return parts.places >= 0
    ? { scale: parts.places, unscaled: digits }
    : { scale: 0, unscaled: digits * powerOfTen(-parts.places) };
}

/** Writes `unscaled × 10^-scale` in plain notation, keeping the scale's trailing zeros: `-0.0025`, `1.50`, `100`. */
function decimalText({ scale, unscaled }: Scaled): string {
  const negative = unscaled < zero;
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, "0");
  const point = digits.length - scale;
  const text = scale === 0 ? digits : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return negative ? `-${text}` : text;
}

export { checkedScale, decimalText, parseDecimal, powerOfTen };
export type { Scaled };
