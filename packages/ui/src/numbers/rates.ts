// Rounding a price or a rate to a tick, exactly. Rates have one unit, the fraction (0.0525 is 5.25% and 525 bp), and
// the number components show them in percent or basis points, so no conversion between units is needed.

import { decimalText, parseDecimal, powerOfTen } from "./decimal-text.ts";
import type { Scaled } from "./decimal-text.ts";
import { defaultRounding, divideRounded } from "./rounding.ts";
import type { Rounding } from "./rounding.ts";

/** A double as the exact decimal its shortest text writes: 0.1 is 1 × 10^-1, not the double's binary value. */
function exactOf(value: number): Scaled {
  return parseDecimal(String(value));
}

/** The multiple of `tick` nearest `value` by `rounding`, read at each double's shortest digits:
 * `roundToTick(4.1337, 0.005)` is 4.135. Throws `RangeError` unless the tick is positive and both are finite. */
function roundToTick(value: number, tick: number, rounding: Rounding = defaultRounding): number {
  if (!Number.isFinite(value) || !Number.isFinite(tick) || tick <= 0) {
    throw new RangeError(
      `roundToTick(${String(value)}, ${String(tick)}) needs a finite value and a positive tick.`,
    );
  }
  const exactValue = exactOf(value);
  const exactTick = exactOf(tick);
  const scale = Math.max(exactValue.scale, exactTick.scale);
  const valueUnits = exactValue.unscaled * powerOfTen(scale - exactValue.scale);
  const tickUnits = exactTick.unscaled * powerOfTen(scale - exactTick.scale);
  const ticks = divideRounded(valueUnits, tickUnits, rounding);
  return Number(decimalText({ scale: exactTick.scale, unscaled: ticks * exactTick.unscaled }));
}

export { exactOf, roundToTick };
