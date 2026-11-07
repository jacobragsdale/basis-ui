// Exact decimal digit strings for the formatter: a double's digits, and rounding half away from zero.

/** Doubles are binary: a power of two scales a double's bits. */
const binary = 2n;
/** A double is a sign bit, 11 bits of exponent biased by 1023, and 52 bits of fraction. */
const fractionBits = 52n;
const exponentBits = 11n;
const exponentBias = 1023;
/** A normal double's fraction sits below an implicit leading 1, which is 2^52 in its integer mantissa. */
const implicitOne = binary ** fractionBits;
/** 2^-k is 5^k × 10^-k, so a negative power of two has the digits of a power of five. */
const halving = 5n;
/** Excel rounds a double to 15 significant digits. */
const significantDigits = 15;
/** One unit in the last place of a digit string. */
const lastPlace = 1n;

/** A positive finite double as an integer mantissa and a binary exponent: the value is `mantissa × 2^exponent`. */
function binaryParts(value: number): [mantissa: bigint, exponent: number] {
  const view = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const biased = Number((bits / implicitOne) % binary ** exponentBits);
  const fraction = bits % implicitOne;
  // A subnormal, whose biased exponent is 0, has no implicit leading 1 and shares the smallest normal exponent.
  const mantissa = biased === 0 ? fraction : fraction + implicitOne;
  return [mantissa, Math.max(biased, 1) - exponentBias - Number(fractionBits)];
}

/** Adds one to a decimal digit string. */
function increment(digits: string): string {
  return (BigInt(digits) + lastPlace).toString().padStart(digits.length, "0");
}

/** The exact decimal digits of a positive finite double rounded to 15 significant digits, half away from zero: the
 * value is `digits × 10^exp`. */
function fifteenDigits(value: number): [digits: string, exp: number] {
  const [mantissa, exp2] = binaryParts(value);
  // With a negative exponent, mantissa × 2^exp2 equals mantissa × 5^-exp2 × 10^exp2.
  const [exact, exp10] =
    exp2 >= 0
      ? [(mantissa * binary ** BigInt(exp2)).toString(), 0]
      : [(mantissa * halving ** BigInt(-exp2)).toString(), exp2];
  if (exact.length <= significantDigits) {
    return [exact, exp10];
  }
  const kept = exact.slice(0, significantDigits);
  const up = (exact[significantDigits] ?? "0") >= "5";
  return [up ? increment(kept) : kept, exp10 + exact.length - significantDigits];
}

/** Drops the last `shift` digits of a digit string, rounding half away from zero. */
function dropDigits(digits: string, shift: number): string {
  if (shift > digits.length) {
    return "0";
  }
  const kept = digits.slice(0, digits.length - shift) || "0";
  return (digits[digits.length - shift] ?? "0") >= "5" ? increment(kept) : kept;
}

/** Rounds `digits × 10^exp` to `places` decimals, half away from zero, and returns the result scaled by `10^places`
 * as a digit string without leading zeros. */
function roundHalfAway(digits: string, exp: number, places: number): string {
  const target = -places;
  const out = exp >= target ? digits + "0".repeat(exp - target) : dropDigits(digits, target - exp);
  return out.replace(/^0+/u, "") || "0";
}

function groupThousands(whole: string): string {
  return whole.replaceAll(/\B(?=(?:\d{3})+$)/gu, ",");
}

export { fifteenDigits, groupThousands, roundHalfAway };
