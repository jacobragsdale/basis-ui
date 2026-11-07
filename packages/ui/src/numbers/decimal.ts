/* `Decimal`: exact fixed-point arithmetic on BigInt, for the decimal strings APIs send.
 *
 * A Decimal is `unscaled × 10^-scale`, and keeps its scale as Python's `decimal` and Java's `BigDecimal` do: `1.50`
 * stays `1.50`, so the formatter shows the decimals the API sent. Addition, subtraction and multiplication are exact;
 * division and rounding name the scale and the rounding they use, so no digit is lost without the code saying so.
 * Its tests run the cases in `tests/fixtures/numbers.json`, which Python's `decimal` module writes.
 *
 * It does display arithmetic only. Anything with a market convention, such as accrued interest, day counts, yields
 * or risk, is the API's to compute. */

import { checkedScale, decimalText, parseDecimal, powerOfTen } from "./decimal-text.ts";
import type { Scaled } from "./decimal-text.ts";
import { defaultRounding, divideRounded } from "./rounding.ts";
import type { Rounding } from "./rounding.ts";

const zero = 0n;

/** The scale and rounding of a result that cannot be exact. */
interface RoundTo {
  /** Digits after the point, from 0. */
  readonly scale: number;
  /** Half away from zero, Excel's, unless set. */
  readonly rounding?: Rounding;
}

function compareBigInts(left: bigint, right: bigint): -1 | 0 | 1 {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** An exact decimal number. Immutable: every operation returns a new one. */
class Decimal {
  /** Zero, at scale 0. */
  public static readonly zero: Decimal = new Decimal(zero, 0);

  /** The digits as an integer: the value is `unscaled × 10^-scale`. */
  public readonly unscaled: bigint;
  /** Digits after the point, from 0. */
  public readonly scale: number;

  private constructor(unscaled: bigint, scale: number) {
    this.unscaled = unscaled;
    this.scale = scale;
    Object.freeze(this);
  }

  /** Reads decimal text exactly, as APIs send it: `Decimal.from("-1234.50")`. Throws `SyntaxError` for text that is
   * not a decimal number. */
  public static from(text: string): Decimal;
  /** The decimal `unscaled × 10^-scale`: `Decimal.from(-123450n, 2)` is -1234.50. */
  public static from(unscaled: bigint, scale?: number): Decimal;
  public static from(value: string | bigint, scale = 0): Decimal {
    const parts: Scaled =
      typeof value === "string"
        ? parseDecimal(value)
        : { scale: checkedScale(scale), unscaled: value };
    return new Decimal(parts.unscaled, parts.scale);
  }

  /** A double rounded to `scale` digits. The double is first read as the shortest decimal that reads back to it,
   * which `String(value)` writes, so `0.1 + 0.2` is 0.30000000000000004 and `1.005` is 1.005, not the binary
   * 1.00499999999999989... Throws `RangeError` for NaN and the infinities. Use it only where a number already is a
   * double, such as a chart's value; amounts arrive as strings. */
  public static fromNumber(value: number, scale: number, rounding: Rounding): Decimal {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${String(value)} has no decimal value.`);
    }
    return Decimal.from(String(value)).round(scale, rounding);
  }

  /** The exact sum, at the largest scale among the values; zero for none. */
  public static sum(values: Iterable<Decimal>): Decimal {
    let total = Decimal.zero;
    for (const value of values) {
      total = total.add(value);
    }
    return total;
  }

  /** The exact sum, at the larger of the two scales. */
  public add(other: Decimal): Decimal {
    const scale = Math.max(this.scale, other.scale);
    return new Decimal(this.#at(scale) + other.#at(scale), scale);
  }

  /** The exact difference, at the larger of the two scales. */
  public sub(other: Decimal): Decimal {
    return this.add(other.neg());
  }

  /** The exact product, at the sum of the two scales. */
  public mul(other: Decimal): Decimal {
    return new Decimal(this.unscaled * other.unscaled, this.scale + other.scale);
  }

  /** The quotient rounded to `scale` digits. Throws `RangeError` when `other` is zero. */
  public div(other: Decimal, { rounding = defaultRounding, scale }: RoundTo): Decimal {
    if (other.isZero()) {
      throw new RangeError(`${this.toString()} cannot be divided by zero.`);
    }
    const shift = checkedScale(scale) + other.scale - this.scale;
    const numerator = shift >= 0 ? this.unscaled * powerOfTen(shift) : this.unscaled;
    const divisor = shift >= 0 ? other.unscaled : other.unscaled * powerOfTen(-shift);
    const positive = divisor > zero;
    return new Decimal(
      divideRounded(positive ? numerator : -numerator, positive ? divisor : -divisor, rounding),
      scale,
    );
  }

  /** -1, 0 or 1 as this is less than, equal to or greater than `other`, whatever their scales. */
  public compare(other: Decimal): -1 | 0 | 1 {
    const scale = Math.max(this.scale, other.scale);
    return compareBigInts(this.#at(scale), other.#at(scale));
  }

  /** Whether the two are the same number: `1.5` equals `1.50`. */
  public equals(other: Decimal): boolean {
    return this.compare(other) === 0;
  }

  public abs(): Decimal {
    return this.unscaled < zero ? this.neg() : this;
  }

  public neg(): Decimal {
    return new Decimal(-this.unscaled, this.scale);
  }

  /** -1, 0 or 1 as the value is negative, zero or positive. */
  public sign(): -1 | 0 | 1 {
    return compareBigInts(this.unscaled, zero);
  }

  public isZero(): boolean {
    return this.unscaled === zero;
  }

  /** The value at `scale` digits: rounded by `rounding` when that drops digits, padded with zeros when it adds them. */
  public round(scale: number, rounding: Rounding = defaultRounding): Decimal {
    const drop = this.scale - checkedScale(scale);
    if (drop <= 0) {
      return new Decimal(this.#at(scale), scale);
    }
    return new Decimal(divideRounded(this.unscaled, powerOfTen(drop), rounding), scale);
  }

  /** Plain notation with the scale's digits, never an exponent: `-1234.50`. */
  public toString(): string {
    return decimalText(this);
  }

  /** The nearest double, for a chart or a canvas. Arithmetic stays on the Decimal. */
  public toNumber(): number {
    return Number(this.toString());
  }

  /** `JSON.stringify` writes a Decimal as its string, the form APIs read. */
  public toJSON(): string {
    return this.toString();
  }

  /** Throws, as Temporal's types do, so that `a < b` and `a + b` fail rather than compare or concatenate text. */
  public valueOf(): never {
    throw new TypeError(
      `Decimal ${this.toString()} has no primitive value: use compare() or equals() to compare, add() and the other methods for arithmetic, and toString() or toNumber() to convert.`,
    );
  }

  /** The unscaled digits at a scale at least this one's. */
  #at(scale: number): bigint {
    return this.unscaled * powerOfTen(scale - this.scale);
  }
}

export { Decimal };
export type { RoundTo };
