/* Display text for values, by parallax's rules, which follow Excel's: a TypeScript port of
 * `packages/parallax/crates/parallax-engine/src/format.rs`, so that a number reads the same in a card as in the grid
 * and in an Excel export. Its tests run every case in the fixtures the Rust formatter writes.
 *
 * Every number is first turned into an exact decimal. A double is rounded to 15 significant digits, half away from
 * zero, as Excel does: 2.675, whose double is 2.67499999999999982..., becomes 2.67500000000000. Decimals and integers
 * are already exact. Percent and K/M/B scaling then move the decimal point, which is exact, and the result is rounded
 * once to the shown decimals, half away from zero. A value that rounds to zero never shows a minus sign.
 *
 * Instants are shown in a display zone, America/New_York unless the format names another. Sub-second digits beyond
 * the shown precision are cut, never rounded, so a time is never shown later than it happened. */

import { fifteenDigits, groupThousands, roundHalfAway } from "./digits.ts";
import { civilText, dateText, utcParts, zonePartsFor } from "./time.ts";
import type { ZoneParts } from "./time.ts";

/** A fixed scaling by a thousand, million or billion. The suffix is always shown. */
type Abbreviation = "K" | "M" | "B";

/** How negative numbers are written: `-1,234.50` or `(1,234.50)`. */
type Negative = "minus" | "parentheses";

/** The sub-second digits an instant shows. */
type TimePrecision = "seconds" | "milliseconds" | "microseconds";

/** How values are displayed. Unset fields take the value type's default. */
interface Format {
  /** Digits after the decimal point. The default is a decimal's scale, 0 for integers, 1 when abbreviating, 2 for a
   * percentage, and 2 for doubles. */
  readonly decimals?: number | null;
  /** Group thousands with commas; the default is yes. */
  readonly thousands?: boolean | null;
  /** Multiply by 100 and append `%`. */
  readonly percent?: boolean;
  /** Divide by a thousand, million or billion and append the suffix. */
  readonly abbreviate?: Abbreviation | null;
  readonly negative?: Negative;
  /** The IANA zone instants are shown in. */
  readonly zone?: string | null;
  readonly precision?: TimePrecision;
}

/** The display zone when a format names none. */
const defaultZone = "America/New_York";
/** The most decimals a format may show, Excel's limit. */
const maxDecimals = 30;
/** Text for a null value. */
const nullText = "";
/** Text for an undefined result, such as NaN or a percentage of zero. */
const undefinedText = "—";

type FormatErrorReason = "unknown-zone" | "too-many-decimals" | "percent-and-abbreviation";

/** A format that cannot be used. */
class FormatError extends Error {
  public readonly reason: FormatErrorReason;

  public constructor(reason: FormatErrorReason, message: string) {
    super(message);
    this.name = "FormatError";
    this.reason = reason;
  }
}

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

/** Each abbreviation and the power of ten it divides by. */
const abbreviations = [
  { power: 3, suffix: "K" },
  { power: 6, suffix: "M" },
  { power: 9, suffix: "B" },
] as const satisfies readonly { readonly power: number; readonly suffix: Abbreviation }[];

/** A percentage multiplies by 10^2. */
const percentPower = 2;

/** The decimals each kind of value shows when the format sets none. */
const naturalDecimals = { abbreviated: 1, float: 2, integer: 0, percent: 2 } as const;

const precisionDigits: Readonly<Record<TimePrecision, number>> = {
  microseconds: 6,
  milliseconds: 3,
  seconds: 0,
};

/** A checked format with its defaults filled in. */
interface Settings {
  /** The power of ten the shown value is scaled by: up for a percentage, down for an abbreviation. */
  readonly power: number;
  /** The abbreviation or `%` written after the digits. */
  readonly suffix: string;
  readonly decimals: number | undefined;
  readonly percent: boolean;
  readonly abbreviated: boolean;
  readonly thousands: boolean;
  readonly negative: Negative;
  readonly precision: TimePrecision;
  readonly zone: string;
  readonly zoneParts: ZoneParts;
}

/** An exact decimal, `digits × 10^exp`, and its sign. */
interface Decimal {
  readonly digits: string;
  readonly exp: number;
  readonly isNegative: boolean;
}

/** The format's decimals, when it sets them. Throws unless they are a count from 0 to 30. */
function checkedDecimals(format: Format): number | undefined {
  const decimals = format.decimals ?? undefined;
  if (
    decimals !== undefined &&
    (!Number.isInteger(decimals) || decimals < 0 || decimals > maxDecimals)
  ) {
    throw new FormatError(
      "too-many-decimals",
      `${String(decimals)} decimals is not a count from 0 to the ${String(maxDecimals)} Excel can show.`,
    );
  }
  return decimals;
}

/** The format's abbreviation, when it sets one. Throws if the format also shows a percentage. */
function checkedAbbreviation(format: Format): Abbreviation | undefined {
  const abbreviation = format.abbreviate ?? undefined;
  if ((format.percent ?? false) && abbreviation !== undefined) {
    throw new FormatError(
      "percent-and-abbreviation",
      "A format cannot both show a percentage and abbreviate.",
    );
  }
  return abbreviation;
}

/** The civil fields of instants in the zone. Throws for a zone the platform does not know. */
function checkedZoneParts(zone: string): ZoneParts {
  try {
    return zonePartsFor(zone);
  } catch {
    throw new FormatError(
      "unknown-zone",
      `Unknown time zone ${zone}: name an IANA zone such as ${defaultZone}.`,
    );
  }
}

function powerOf(percent: boolean, abbreviation: Abbreviation | undefined): number {
  if (percent) {
    return percentPower;
  }
  const found = abbreviations.find(({ suffix }) => suffix === abbreviation);
  return found === undefined ? 0 : -found.power;
}

/** Checks a format's decimals, then its abbreviation, then its zone, and fills in its defaults. */
function settingsOf(format: Format): Settings {
  const decimals = checkedDecimals(format);
  const abbreviation = checkedAbbreviation(format);
  const percent = format.percent ?? false;
  const zone = format.zone ?? defaultZone;
  return {
    abbreviated: abbreviation !== undefined,
    decimals,
    negative: format.negative ?? "minus",
    percent,
    power: powerOf(percent, abbreviation),
    precision: format.precision ?? "seconds",
    suffix: `${abbreviation ?? ""}${percent ? "%" : ""}`,
    thousands: format.thousands ?? true,
    zone,
    zoneParts: checkedZoneParts(zone),
  };
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

function floatText(settings: Settings, value: number): string {
  if (Number.isNaN(value)) {
    return undefinedText;
  }
  const isNegative = value < 0 || Object.is(value, -0);
  if (!Number.isFinite(value)) {
    return signed(settings, isNegative, "∞");
  }
  const [digits, exp] = value === 0 ? ["0", 0] : fifteenDigits(Math.abs(value));
  return numberText(
    settings,
    { digits, exp, isNegative },
    decimalsOr(settings, naturalDecimals.float),
  );
}

function decimalText(settings: Settings, unscaled: bigint, scale: number): string {
  const natural = Math.min(Math.max(scale, 0), maxDecimals);
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

export { FormatError, createFormatter, defaultZone, maxDecimals, nullText, undefinedText };
export { outOfRangeText } from "./time.ts";
export type { Abbreviation, Format, FormatErrorReason, Formatter, Negative, TimePrecision };
