// What a dashboard derives for display: the change between two values, as an amount and as a fraction, and the shares
// of a total. A value with no answer, such as a change from zero, says so by name rather than with NaN.

import { checkedScale, powerOfTen } from "./decimal-text.ts";
import { exactOf } from "./rates.ts";
import { divideRounded } from "./rounding.ts";

/** A derived value, or the reason there is none. */
type Derived<TValue, TReason extends string> =
  | { readonly defined: true; readonly value: TValue }
  | { readonly defined: false; readonly reason: TReason };

/** A change from zero has no percentage. */
type PercentChange = Derived<number, "zero-base">;

/** A total of zero, which includes no values at all, has no shares. */
type Shares = Derived<readonly number[], "zero-total">;

const zero = 0n;
const one = 1n;

/** `to - from`. */
function delta(from: number, to: number): number {
  return to - from;
}

/** The change from `from` to `to` as a fraction of `from`'s size, `(to - from) / |from|`: 0.05 for a rise from 100 to
 * 105. Dividing by the size keeps the sign with the direction of the move, so a loss that narrows from -100 to -50 is
 * +0.5, where Excel's `(to - from) / from` gives -0.5. Show it with `Pct`. */
function percentChange(from: number, to: number): PercentChange {
  if (from === 0) {
    return { defined: false, reason: "zero-base" };
  }
  return { defined: true, value: (to - from) / Math.abs(from) };
}

/** One value's share of the total, in units of the result's last digit, rounded down, and what rounding down left. */
interface Floored {
  readonly index: number;
  readonly units: bigint;
  readonly remainder: bigint;
}

function byLargestRemainder(left: Floored, right: Floored): number {
  if (left.remainder !== right.remainder) {
    return left.remainder > right.remainder ? -1 : 1;
  }
  return left.index - right.index;
}

/** Each value's share of a nonzero total rounded down, with the values as unscaled digits at one scale. */
function flooredShares(
  digits: readonly bigint[],
  total: bigint,
  scale: number,
): readonly Floored[] {
  // Dividing by a negative total is dividing by its size with every numerator's sign flipped.
  const sign = total < zero ? -one : one;
  return digits.map((value, index) => {
    const numerator = sign * value * powerOfTen(scale);
    const units = divideRounded(numerator, sign * total, "floor");
    return { index, remainder: numerator - units * sign * total, units };
  });
}

/** Each value's exact digits, read at its shortest text, all at the largest scale among them. */
function commonDigits(values: readonly number[]): bigint[] {
  const exact = values.map((value) => exactOf(value));
  const common = Math.max(0, ...exact.map((value) => value.scale));
  return exact.map((value) => value.unscaled * powerOfTen(common - value.scale));
}

/** Each value's weight in the total, as a fraction to `scale` decimals, the weights summing to exactly 1 at that
 * scale. Each value is read at its shortest digits; every weight is its exact share rounded down or up by one unit in
 * the last digit, and the units still short of 1 go to the largest remainders, the earlier value first on a tie: the
 * largest remainder method. Negative values, as in a long and short book, take negative weights. */
function shares(values: readonly number[], { scale }: { readonly scale: number }): Shares {
  const digits = commonDigits(values);
  const total = digits.reduce((sum, value) => sum + value, zero);
  if (total === zero) {
    return { defined: false, reason: "zero-total" };
  }
  const floored = flooredShares(digits, total, checkedScale(scale));
  const short = powerOfTen(scale) - floored.reduce((sum, { units }) => sum + units, zero);
  const raised = new Set(
    floored
      .toSorted(byLargestRemainder)
      .slice(0, Number(short))
      .map(({ index }) => index),
  );
  const unit = Number(powerOfTen(scale));
  return {
    defined: true,
    value: floored.map(
      ({ index, units }) => Number(raised.has(index) ? units + one : units) / unit,
    ),
  };
}

export { delta, percentChange, shares };
export type { Derived, PercentChange, Shares };
