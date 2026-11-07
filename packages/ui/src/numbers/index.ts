/* `@basis/ui/numbers`: display arithmetic, so that no app adds a decimal library. `Decimal` is exact fixed-point
 * arithmetic for the decimal strings APIs send, and feeds the formatter as `formatter.decimal(d.unscaled, d.scale)`;
 * `sumPrecise` adds doubles exactly; and the rest are the rates, Treasury prices and derived values a dashboard shows.
 * Anything with a market convention, such as accrued interest, day counts, yields or risk, is the API's to compute. */

export { Decimal, type RoundTo } from "./decimal.ts";
export { defaultRounding, type Rounding } from "./rounding.ts";
export { sumPrecise } from "./sum.ts";
export {
  bpsToFraction,
  bpsToPercent,
  fractionToBps,
  fractionToPercent,
  percentToBps,
  percentToFraction,
  roundToTick,
} from "./rates.ts";
export {
  formatThirtySeconds,
  parseThirtySeconds,
  type ThirtySecondsFormat,
  type ThirtySecondsPrecision,
  type ThirtySecondsResult,
} from "./thirty-seconds.ts";
export {
  delta,
  percentChange,
  shares,
  type Derived,
  type PercentChange,
  type Shares,
} from "./derive.ts";
