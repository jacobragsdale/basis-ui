/* `sumPrecise`: the exact sum of doubles, rounded once to the nearest double, as `Math.sumPrecise` defines it.
 *
 * Chrome 147 ships `Math.sumPrecise`, and this calls it where it exists. Elsewhere, Node 26 included, `exactSum`
 * computes the same result: Shewchuk's exact addition as Python's `math.fsum` implements it, with sums past the
 * largest double carried in multiples of 2^1024, in `src/vendor/sum-precise`, adapted from the TC39 proposal's
 * polyfill. */

import { exactSum } from "#vendor/sum-precise/exact-sum.ts";

/** `Math.sumPrecise` as the browser ships it, a method TypeScript's library does not declare yet. */
interface MathWithSumPrecise {
  readonly sumPrecise?: (values: Iterable<number>) => number;
}

const math: Math & MathWithSumPrecise = Math;

/** The exact sum of doubles, rounded once, where adding them in turn would round at every step: `[0.1, 0.2, 0.3]`
 * sums to 0.6, not 0.6000000000000001, and `[1e100, 1, -1e100]` to 1, not 0. NaN in, or both infinities, gives NaN. */
function sumPrecise(numbers: Iterable<number>): number {
  return math.sumPrecise === undefined ? exactSum(numbers) : math.sumPrecise(numbers);
}

export { sumPrecise };
