/**
 * @license The Math.sumPrecise polyfill in tc39/proposal-math-sum at commit 77d52dc, BSD-3-Clause. Copyright (c) 2024
 * Kevin Gibbons. The license is in src/vendor/sum-precise/LICENSE, beside this file.
 *
 * Copied from https://github.com/tc39/proposal-math-sum/blob/77d52dc3906fd5b9a49a17666c2acca34f57aa04/polyfill/polyfill.mjs
 * and rewritten in strict TypeScript to pass @basis/ui's lint, in functions of ten statements or fewer. It computes
 * what the original does: Shewchuk's exact addition, as Python's `math.fsum` implements it, with sums past the largest
 * double carried in multiples of 2^1024, then the exact sum rounded once, ties to even. It leaves out the original's
 * RangeError at 2^53 carries, which would take 2^53 values to reach.
 */

/** A double's largest exponent, and the bits of fraction below its leading 1. */
const maxExponent = 1023;
const fractionBits = 52;
/** Half of 2^1024, the first power of two past the largest double. */
const twoTo1023 = 2 ** maxExponent;
/** The spacing of doubles just below 2^1024. */
const topUlp = 2 ** (maxExponent - fractionBits);

type Pair = readonly [hi: number, lo: number];

/** `hi + lo` is exactly `x + y`, when `|x| >= |y|` or `x` is zero. */
function twoSum(x: number, y: number): Pair {
  const hi = x + y;
  return [hi, y - (hi - x)];
}

function largerFirst(x: number, y: number): Pair {
  return Math.abs(x) < Math.abs(y) ? [y, x] : [x, y];
}

/** One exact addition, and the multiple of 2^1024 it carried out when the sum passed the largest double. */
interface Step {
  readonly hi: number;
  readonly lo: number;
  readonly carry: number;
}

function addExactly(x: number, partial: number): Step {
  const [big, small] = largerFirst(x, partial);
  const [hi, lo] = twoSum(big, small);
  if (Number.isFinite(hi)) {
    return { carry: 0, hi, lo };
  }
  const carry = Math.sign(hi);
  // `big` is at least 2^1023 in size, so taking 2^1024 from it in two halves is exact.
  const [reducedBig, reducedSmall] = largerFirst(
    big - carry * twoTo1023 - carry * twoTo1023,
    small,
  );
  const [reducedHi, reducedLo] = twoSum(reducedBig, reducedSmall);
  return { carry, hi: reducedHi, lo: reducedLo };
}

/** When the roundoff is exactly half an ulp, the next partial down says which way the tie goes. */
function settledTie(hi: number, lo: number, next: number | undefined): number {
  if (next === undefined || lo === 0 || Math.sign(lo) !== Math.sign(next)) {
    return hi;
  }
  const doubled = lo * 2;
  const moved = hi + doubled;
  return moved - hi === doubled ? moved : hi;
}

/** Adds the partials to `start` from the largest down, stopping once a step loses precision, then settles a tie. */
function folded(partials: readonly number[], start: number): number {
  let index = partials.length - 1;
  let [hi, lo] = [start, 0];
  while (index >= 0) {
    [hi, lo] = twoSum(hi, partials[index] ?? 0);
    index -= 1;
    if (lo !== 0) {
      break;
    }
  }
  return settledTie(hi, lo, partials[index]);
}

/** The sum is within rounding of ±2^1024, so it is the largest double or an infinity. The largest double's last bit
 * is odd, so a sum exactly half an ulp short of 2^1024 ties to the infinity, unless a further partial pulls it back. */
function nearLimit(hi: number, lo: number, next: number | undefined): number {
  const sign = Math.sign(hi);
  const pulledBack =
    hi === sign * twoTo1023 &&
    lo === (-sign * topUlp) / 2 &&
    next !== undefined &&
    Math.sign(next) === -sign;
  return sign * (pulledBack ? Number.MAX_VALUE : Number.POSITIVE_INFINITY);
}

/** The total when partials past the largest double carried out `overflow` × 2^1024. */
function overflowed(partials: readonly number[], overflow: number): number {
  const top = partials.at(-1) ?? 0;
  const rest = partials.slice(0, -1);
  if (Math.abs(overflow) > 1 || Math.sign(top) === Math.sign(overflow)) {
    return Math.sign(overflow) * Number.POSITIVE_INFINITY;
  }
  // Halved, the carried 2^1024 and the top partial add without overflowing.
  const [hi, halfLo] = twoSum(overflow * twoTo1023, top / 2);
  const lo = halfLo * 2;
  if (!Number.isFinite(hi * 2)) {
    return nearLimit(hi, lo, rest.at(-1));
  }
  return folded(lo === 0 ? rest : [...rest, lo], hi * 2);
}

/** An infinity and NaN, or the two infinities, make NaN; one infinity alone stays itself. */
function withNonFinite(current: number | undefined, value: number): number {
  return current === undefined || Object.is(current, value) ? value : Number.NaN;
}

/** A running exact sum: Shewchuk's partials, doubles that do not overlap, smallest first, whose exact sum is the
 * total, and the multiples of 2^1024 carried out of them. */
class ExactSum {
  #partials: readonly number[] = [];
  #overflow = 0;
  #nonFinite: number | undefined = undefined;
  #onlyNegativeZeros = true;

  public add(value: number): void {
    this.#onlyNegativeZeros &&= Object.is(value, -0);
    if (!Number.isFinite(value)) {
      this.#nonFinite = withNonFinite(this.#nonFinite, value);
    } else if (this.#nonFinite === undefined) {
      this.#addFinite(value);
    }
  }

  /** The sum rounded once. An empty list, or one of only negative zeros, sums to -0. */
  public total(): number {
    if (this.#nonFinite !== undefined) {
      return this.#nonFinite;
    }
    if (this.#onlyNegativeZeros) {
      return -0;
    }
    return this.#overflow === 0
      ? folded(this.#partials, 0)
      : overflowed(this.#partials, this.#overflow);
  }

  #addFinite(value: number): void {
    let x = value;
    const kept: number[] = [];
    for (const partial of this.#partials) {
      const step = addExactly(x, partial);
      this.#overflow += step.carry;
      if (step.lo !== 0) {
        kept.push(step.lo);
      }
      x = step.hi;
    }
    this.#partials = x === 0 ? kept : [...kept, x];
  }
}

/** `Math.sumPrecise` where the browser lacks it: the exact sum rounded once, ties to even. */
function exactSum(values: Iterable<number>): number {
  const sum = new ExactSum();
  for (const value of values) {
    sum.add(value);
  }
  return sum.total();
}

export { exactSum };
