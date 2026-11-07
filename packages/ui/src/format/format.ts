/* Display text for values, by parallax's rules, which follow Excel's: a TypeScript port of
 * `packages/parallax/crates/parallax-engine/src/format.rs`, so that a number reads the same in a card as in the grid
 * and in an Excel export. Its tests run every case in the fixtures the Rust formatter writes.
 *
 * Every number is first turned into an exact decimal. A double is rounded to 15 significant digits, half away from
 * zero, as Excel does: 2.675, whose double is 2.67499999999999982..., becomes 2.67500000000000. Decimals and integers
 * are already exact. Percent, basis-point and K/M/B scaling then move the decimal point, which is exact, and the result
 * is rounded once to the shown decimals, half away from zero. A value that rounds to zero never shows a minus sign.
 *
 * A Treasury price in 32nds, `99-16+`, is written by `formatThirtySeconds`, as `Price32` writes it: a double is read at
 * its shortest digits and rounded to 8 decimals, then to the step, half away from zero. `Bps` and `Price32` write
 * through this formatter, so a rate or a price reads the same in a card as in the grid.
 *
 * Instants are shown in a display zone, America/New_York unless the format names another. Sub-second digits beyond
 * the shown precision are cut, never rounded, so a time is never shown later than it happened. */

import { Decimal as ExactDecimal } from "#numbers/decimal.ts";
import { formatThirtySeconds } from "#numbers/thirty-seconds.ts";
import type { ThirtySecondsPrecision } from "#numbers/thirty-seconds.ts";

import { fifteenDigits, groupThousands, roundHalfAway } from "./digits.ts";
import { bpSuffix, bpsPower, maxDecimals, settingsOf, undefinedText } from "./settings.ts";
import type { Format, Settings, TimePrecision } from "./settings.ts";
import { civilText, dateText, utcParts } from "./time.ts";

/** A checked format, ready to format values. */
interface Formatter {
  /** The zone instants are shown in. */
  readonly zone: string;
  /** A double: 15 significant digits, then the shown decimals. */
  readonly float: (value: number) => string;
  /** An exact decimal, `unscaled × 10^-scale`. */
  readonly decimal: (unscaled: bigint, scale: number) => string;
  /** An integer. A `number` must be a safe integer; larger ones travel as `bigint`. */
  readonly integer: (value: bigint | number) => string;
  /** A date, as days since 1970-01-01, written `YYYY-MM-DD`. Dates never pass through a zone. */
  readonly date: (days: number) => string;
  /** An instant (`zoned`) in the display zone, or a wall-clock time as stored, to the format's precision. */
  readonly timestamp: (micros: bigint, zoned: boolean) => string;
  /** A boolean, as Excel writes it. */
  readonly boolean: (value: boolean) => string;
}

/** The decimals a double price is read at before it is rounded to 32nds, as Price32 reads one. */
const priceDecimals = 8;

/** The decimals each kind of value shows when the format sets none. */
const naturalDecimals = { abbreviated: 1, float: 2, integer: 0, percent: 2 } as const;
/** A decimal of a negative scale holds whole tens, hundreds and so on. */
const tenBig = 10n;

const precisionDigits: Readonly<Record<TimePrecision, number>> = {
  microseconds: 6,
  milliseconds: 3,
  seconds: 0,
};

/** An exact decimal, `digits × 10^exp`, and its sign. */
interface Decimal {
  readonly digits: string;
  readonly exp: number;
  readonly isNegative: boolean;
}

function decimalsOr(settings: Settings, natural: number): number {
  if (settings.decimals !== undefined) {
    return settings.decimals;
  }
  if (settings.percent) {
    return naturalDecimals.percent;
  }
  return settings.abbreviated ? naturalDecimals.abbreviated : natural;
}

function signed(settings: Settings, isNegative: boolean, body: string): string {
  if (!isNegative) {
    return body;
  }
  return settings.negative === "minus" ? `-${body}` : `(${body})`;
}

/** Writes an exact decimal rounded to `places` decimals. */
function numberText(settings: Settings, value: Decimal, places: number): string {
  const rounded = roundHalfAway(value.digits, value.exp + settings.power, places);
  const isZero = /^0+$/u.test(rounded);
  const padded = rounded.padStart(places + 1, "0");
  const whole = padded.slice(0, padded.length - places);
  const grouped = settings.thousands ? groupThousands(whole) : whole;
  const fraction = places > 0 ? `.${padded.slice(padded.length - places)}` : "";
  return signed(settings, value.isNegative && !isZero, `${grouped}${fraction}${settings.suffix}`);
}

/** A price in 32nds, as `Price32` writes it, with parentheses for a negative if the format asks. */
function priceText(
  settings: Settings,
  price: ExactDecimal,
  precision: ThirtySecondsPrecision,
): string {
  const text = formatThirtySeconds(price, { precision, rounding: "half-away-from-zero" });
  return text.startsWith("-") ? signed(settings, true, text.slice(1)) : text;
}

function floatText(settings: Settings, value: number): string {
  if (Number.isNaN(value)) {
    return undefinedText;
  }
  const isNegative = value < 0 || Object.is(value, -0);
  if (settings.thirtySeconds !== undefined) {
    // A price has no infinity, as Price32 says.
    return Number.isFinite(value)
      ? priceText(
          settings,
          ExactDecimal.fromNumber(value, priceDecimals, "half-away-from-zero"),
          settings.thirtySeconds,
        )
      : undefinedText;
  }
  if (!Number.isFinite(value)) {
    return signed(settings, isNegative, `∞${settings.bps ? bpSuffix : ""}`);
  }
  const [digits, exp] = value === 0 ? ["0", 0] : fifteenDigits(Math.abs(value));
  return numberText(
    settings,
    { digits, exp, isNegative },
    decimalsOr(settings, naturalDecimals.float),
  );
}

function decimalText(settings: Settings, unscaled: bigint, scale: number): string {
  if (settings.thirtySeconds !== undefined) {
    const price =
      scale < 0
        ? ExactDecimal.from(unscaled * tenBig ** BigInt(-scale))
        : ExactDecimal.from(unscaled, scale);
    return priceText(settings, price, settings.thirtySeconds);
  }
  // Basis points move the point four places, and take the decimals the moved value has, as Bps does.
  const shift = settings.bps ? bpsPower : 0;
  const natural = Math.min(Math.max(scale - shift, 0), maxDecimals);
  const isNegative = unscaled < 0;
  const magnitude = isNegative ? -unscaled : unscaled;
  return numberText(
    settings,
    { digits: magnitude.toString(), exp: -scale, isNegative },
    decimalsOr(settings, natural),
  );
}

function integerText(settings: Settings, value: bigint | number): string {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError(`${String(value)} is not a safe integer; pass it as a bigint.`);
  }
  const big = BigInt(value);
  if (settings.thirtySeconds !== undefined) {
    return priceText(settings, ExactDecimal.from(big), settings.thirtySeconds);
  }
  const isNegative = big < 0;
  return numberText(
    settings,
    { digits: (isNegative ? -big : big).toString(), exp: 0, isNegative },
    decimalsOr(settings, naturalDecimals.integer),
  );
}

function timestampText(settings: Settings, micros: bigint, zoned: boolean): string {
  return civilText(
    micros,
    zoned ? settings.zoneParts : utcParts,
    precisionDigits[settings.precision],
  );
}

function booleanText(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

/** Checks a format and returns its formatter. Throws `FormatError` for an unknown zone, more than 30 decimals, or a
 * percentage that also abbreviates. */
function createFormatter(format: Format = {}): Formatter {
  const settings = settingsOf(format);
  return {
    boolean: booleanText,
    date: dateText,
    decimal: (unscaled, scale) => decimalText(settings, unscaled, scale),
    float: (value) => floatText(settings, value),
    integer: (value) => integerText(settings, value),
    timestamp: (micros, zoned) => timestampText(settings, micros, zoned),
    zone: settings.zone,
  };
}

export { FormatError, defaultZone, maxDecimals, nullText, undefinedText } from "./settings.ts";
export { createFormatter };
export { outOfRangeText } from "./time.ts";
export type {
  Abbreviation,
  Format,
  FormatErrorReason,
  Negative,
  SuffixStyle,
  TimePrecision,
} from "./settings.ts";
export type { Formatter };
