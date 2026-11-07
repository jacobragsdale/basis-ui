// How `Decimal` rounds: the six modes, and integer division rounded by one of them.

/** How a value that falls between two representable results is rounded.
 *
 * - `half-away-from-zero`: to the nearest, a tie away from zero. Excel's `ROUND`, and the default here.
 * - `half-even`: to the nearest, a tie to the even neighbour (banker's rounding, IEEE 754's default).
 * - `toward-zero`: truncation. Python's `ROUND_DOWN`.
 * - `away-from-zero`: any remainder rounds away from zero. Python's `ROUND_UP`.
 * - `floor`: toward negative infinity.
 * - `ceiling`: toward positive infinity. */
type Rounding =
  | "half-away-from-zero"
  | "half-even"
  | "toward-zero"
  | "away-from-zero"
  | "floor"
  | "ceiling";

/** Excel's rounding, which a number in a card must match. */
const defaultRounding: Rounding = "half-away-from-zero";

const zero = 0n;
const one = 1n;
const two = 2n;

/** Where a remainder sits against half the divisor. */
type Half = "below" | "tie" | "above";

/** What a rounding mode needs to know about a quotient that was truncated. */
interface Truncated {
  readonly negative: boolean;
  readonly half: Half;
  readonly odd: boolean;
}

/** Whether each mode moves a truncated quotient one step away from zero. */
const roundsAway: Readonly<Record<Rounding, (truncated: Truncated) => boolean>> = {
  "half-away-from-zero": ({ half }) => half !== "below",
  "half-even": ({ half, odd }) => half === "above" || (half === "tie" && odd),
  "toward-zero": () => false,
  "away-from-zero": () => true,
  floor: ({ negative }) => negative,
  ceiling: ({ negative }) => !negative,
};

function halfOf(remainder: bigint, divisor: bigint): Half {
  const doubled = (remainder < zero ? -remainder : remainder) * two;
  if (doubled === divisor) {
    return "tie";
  }
  return doubled < divisor ? "below" : "above";
}

/** `numerator / divisor` rounded to an integer by `rounding`. The divisor must be positive. */
function divideRounded(numerator: bigint, divisor: bigint, rounding: Rounding): bigint {
  // BigInt division truncates toward zero, and the remainder takes the numerator's sign.
  const quotient = numerator / divisor;
  const remainder = numerator % divisor;
  if (remainder === zero) {
    return quotient;
  }
  const negative = numerator < zero;
  const truncated = { half: halfOf(remainder, divisor), negative, odd: quotient % two !== zero };
  if (!roundsAway[rounding](truncated)) {
    return quotient;
  }
  return negative ? quotient - one : quotient + one;
}

export { defaultRounding, divideRounded };
export type { Rounding };
