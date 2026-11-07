// Rates as basis points, percent and fractions, exactly, and rounding to a tick.

import { Decimal } from "./decimal.ts";
import { powerOfTen } from "./decimal-text.ts";
import { defaultRounding } from "./rounding.ts";
import type { Rounding } from "./rounding.ts";

/** A basis point is a ten-thousandth of the whole, and a percent a hundredth. */
const bpsPlaces = 4;
const percentPlaces = 2;

/** `value × 10^places`, exactly. The point moves through the scale, and digits change only once the scale is used up,
 * so `0.0025` becomes `25` and `0.05` becomes `500`, with no trailing zeros added. */
function movePoint(value: Decimal, places: number): Decimal {
  if (places <= 0) {
    return Decimal.from(value.unscaled, value.scale - places);
  }
  const scale = Math.max(value.scale - places, 0);
  return Decimal.from(value.unscaled * powerOfTen(places - value.scale + scale), scale);
}

/** Basis points as a fraction: 25 bp is 0.0025. */
function bpsToFraction(bps: Decimal): Decimal {
  return movePoint(bps, -bpsPlaces);
}

/** A fraction in basis points: 0.0025 is 25 bp. */
function fractionToBps(fraction: Decimal): Decimal {
  return movePoint(fraction, bpsPlaces);
}

/** A percentage as a fraction: 4.125% is 0.04125. */
function percentToFraction(percent: Decimal): Decimal {
  return movePoint(percent, -percentPlaces);
}

/** A fraction as a percentage: 0.04125 is 4.125%. The formatter's `percent` format does this for display. */
function fractionToPercent(fraction: Decimal): Decimal {
  return movePoint(fraction, percentPlaces);
}

/** Basis points as a percentage: 25 bp is 0.25%. */
function bpsToPercent(bps: Decimal): Decimal {
  return movePoint(bps, percentPlaces - bpsPlaces);
}

/** A percentage in basis points: 0.25% is 25 bp. */
function percentToBps(percent: Decimal): Decimal {
  return movePoint(percent, bpsPlaces - percentPlaces);
}

/** The multiple of `tick` nearest `value` by `rounding`, at the tick's scale: `roundToTick(4.1337, 0.005)` is 4.135.
 * Throws `RangeError` unless the tick is positive. */
function roundToTick(value: Decimal, tick: Decimal, rounding: Rounding = defaultRounding): Decimal {
  if (tick.sign() <= 0) {
    throw new RangeError(`A tick of ${tick.toString()} is not positive.`);
  }
  return value.div(tick, { rounding, scale: 0 }).mul(tick);
}

export {
  bpsToFraction,
  bpsToPercent,
  fractionToBps,
  fractionToPercent,
  percentToBps,
  percentToFraction,
  roundToTick,
};
