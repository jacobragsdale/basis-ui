/* `@basis/ui/numbers`: display arithmetic on the doubles APIs send, so that no app adds a decimal library or rounds by
 * hand. `sumPrecise` adds doubles exactly; the rest are tick rounding, Treasury prices in 32nds and the values a
 * dashboard derives. Every number is a double and every rate a fraction; the number components round once, for
 * display. Anything with a market convention, such as accrued interest, day counts, yields or risk, is the API's. */

export { defaultRounding, type Rounding } from "./rounding.ts";
export { sumPrecise } from "./sum.ts";
export { roundToTick } from "./rates.ts";
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
