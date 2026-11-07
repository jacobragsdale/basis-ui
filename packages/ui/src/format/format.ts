// Display text for values, by parallax's rules, which follow Excel's: a TypeScript port of
// `packages/parallax/crates/parallax-engine/src/format.rs`, so that a number reads the same in a card as in the grid
// and in an Excel export. Its tests run every case in the fixtures the Rust formatter writes.
//
// Every number is first turned into an exact decimal. A double is rounded to 15 significant digits, half away from
// zero, as Excel does: 2.675, whose double is 2.67499999999999982..., becomes 2.67500000000000. Decimals and integers
// are already exact. Percent and K/M/B scaling then move the decimal point, which is exact, and the result is rounded
// once to the shown decimals, half away from zero. A value that rounds to zero never shows a minus sign.
//
// Instants are shown in a display zone, America/New_York unless the format names another. Sub-second digits beyond
// the shown precision are cut, never rounded, so a time is never shown later than it happened.

/** A fixed scaling by a thousand, million or billion. The suffix is always shown. */
export type Abbreviation = "K" | "M" | "B";

/** How negative numbers are written: `-1,234.50` or `(1,234.50)`. */
export type Negative = "minus" | "parentheses";

/** The sub-second digits an instant shows. */
export type TimePrecision = "seconds" | "milliseconds" | "microseconds";

/** How values are displayed. Unset fields take the value type's default. */
export interface Format {
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
export const defaultZone = "America/New_York";
/** The most decimals a format may show, Excel's limit. */
export const maxDecimals = 30;
/** Text for a null value. */
export const nullText = "";
/** Text for an undefined result, such as NaN or a percentage of zero. */
export const undefinedText = "—";
/** Text for a value outside the range a date can show. */
export const outOfRangeText = "out of range";

export type FormatErrorReason = "unknown-zone" | "too-many-decimals" | "percent-and-abbreviation";

/** A format that cannot be used. */
export class FormatError extends Error {
  readonly reason: FormatErrorReason;

  constructor(reason: FormatErrorReason, message: string) {
    super(message);
    this.name = "FormatError";
    this.reason = reason;
  }
}

/** A checked format, ready to format values. */
export interface Formatter {
  /** The zone instants are shown in. */
  readonly zone: string;
  /** A double: 15 significant digits, then the shown decimals. */
  float(value: number): string;
  /** An exact decimal, `unscaled × 10^-scale`. */
  decimal(unscaled: bigint, scale: number): string;
  /** An integer. A `number` must be a safe integer; larger ones travel as `bigint`. */
  integer(value: bigint | number): string;
  /** A date, as days since 1970-01-01, written `YYYY-MM-DD`. Dates never pass through a zone. */
  date(days: number): string;
  /** An instant (`zoned`) in the display zone, or a wall-clock time as stored, to the format's precision. */
  timestamp(micros: bigint, zoned: boolean): string;
  /** A boolean, as Excel writes it. */
  boolean(value: boolean): string;
}

const shifts: Readonly<Record<Abbreviation, number>> = { K: 3, M: 6, B: 9 };
const precisionDigits: Readonly<Record<TimePrecision, number>> = {
  seconds: 0,
  milliseconds: 3,
  microseconds: 6,
};

/** Checks a format and returns its formatter. Throws `FormatError` for an unknown zone, more than 30 decimals, or a
 * percentage that also abbreviates. */
export function createFormatter(format: Format = {}): Formatter {
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
  const percent = format.percent ?? false;
  const abbreviate = format.abbreviate ?? undefined;
  if (percent && abbreviate !== undefined) {
    throw new FormatError(
      "percent-and-abbreviation",
      "A format cannot both show a percentage and abbreviate.",
    );
  }
  const zone = format.zone ?? defaultZone;
  const zoneParts = zonePartsFor(zone);
  const thousands = format.thousands ?? true;
  const negative = format.negative ?? "minus";
  const precision = format.precision ?? "seconds";

  function decimalsOr(natural: number): number {
    if (decimals !== undefined) {
      return decimals;
    }
    if (percent) {
      return 2;
    }
    return abbreviate === undefined ? natural : 1;
  }

  function signed(isNegative: boolean, body: string): string {
    if (!isNegative) {
      return body;
    }
    return negative === "minus" ? `-${body}` : `(${body})`;
  }

  /** Formats `digits × 10^exp`, rounded to `places` decimals. */
  function number(isNegative: boolean, digits: string, exp: number, places: number): string {
    let shifted = exp;
    if (percent) {
      shifted += 2;
    }
    if (abbreviate !== undefined) {
      shifted -= shifts[abbreviate];
    }
    const rounded = roundHalfAway(digits, shifted, places);
    const isZero = /^0+$/u.test(rounded);
    const padded = rounded.padStart(places + 1, "0");
    const whole = padded.slice(0, padded.length - places);
    let body = thousands ? groupThousands(whole) : whole;
    if (places > 0) {
      body += `.${padded.slice(padded.length - places)}`;
    }
    if (abbreviate !== undefined) {
      body += abbreviate;
    }
    if (percent) {
      body += "%";
    }
    return signed(isNegative && !isZero, body);
  }

  function timestampTo(micros: bigint, zoned: boolean, digits: number): string {
    const parts = zoned ? zoneParts : utcParts;
    return civilText(micros, parts, digits);
  }

  return {
    zone,
    float(value) {
      if (Number.isNaN(value)) {
        return undefinedText;
      }
      const isNegative = value < 0 || Object.is(value, -0);
      if (!Number.isFinite(value)) {
        return signed(isNegative, "∞");
      }
      const [digits, exp] = value === 0 ? ["0", 0] : fifteenDigits(Math.abs(value));
      return number(isNegative, digits, exp, decimalsOr(2));
    },
    decimal(unscaled, scale) {
      const natural = Math.min(Math.max(scale, 0), maxDecimals);
      const magnitude = unscaled < 0n ? -unscaled : unscaled;
      return number(unscaled < 0n, magnitude.toString(), -scale, decimalsOr(natural));
    },
    integer(value) {
      if (typeof value === "number" && !Number.isSafeInteger(value)) {
        throw new RangeError(`${String(value)} is not a safe integer; pass it as a bigint.`);
      }
      const big = BigInt(value);
      return number(big < 0n, (big < 0n ? -big : big).toString(), 0, decimalsOr(0));
    },
    date: dateText,
    timestamp(micros, zoned) {
      return timestampTo(micros, zoned, precisionDigits[precision]);
    },
    boolean(value) {
      return value ? "TRUE" : "FALSE";
    },
  };
}

/** The exact decimal digits of a positive finite double rounded to 15 significant digits, half away from zero: the
 * value is `digits × 10^exp`. */
function fifteenDigits(value: number): [digits: string, exp: number] {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n);
  const exp2 = biased === 0 ? -1074 : biased - 1075;
  // mantissa × 2^exp2 is exact; with a negative exponent it equals mantissa × 5^-exp2 × 10^exp2.
  const [exact, exp10] =
    exp2 >= 0
      ? [(mantissa << BigInt(exp2)).toString(), 0]
      : [(mantissa * 5n ** BigInt(-exp2)).toString(), exp2];
  if (exact.length <= 15) {
    return [exact, exp10];
  }
  const kept = exact.slice(0, 15);
  const up = (exact[15] ?? "0") >= "5";
  return [up ? increment(kept) : kept, exp10 + exact.length - 15];
}

/** Adds one to a decimal digit string. */
function increment(digits: string): string {
  return (BigInt(digits) + 1n).toString().padStart(digits.length, "0");
}

/** Rounds `digits × 10^exp` to `places` decimals, half away from zero, and returns the result scaled by `10^places`
 * as a digit string without leading zeros. */
function roundHalfAway(digits: string, exp: number, places: number): string {
  const target = -places;
  let out: string;
  if (exp >= target) {
    out = digits + "0".repeat(exp - target);
  } else {
    const shift = target - exp;
    if (shift > digits.length) {
      out = "0";
    } else {
      const kept = digits.slice(0, digits.length - shift) || "0";
      out = (digits[digits.length - shift] ?? "0") >= "5" ? increment(kept) : kept;
    }
  }
  return out.replace(/^0+/u, "") || "0";
}

function groupThousands(whole: string): string {
  return whole.replaceAll(/\B(?=(\d{3})+$)/gu, ",");
}

function pad(value: number, width: number): string {
  return String(Math.abs(value)).padStart(width, "0");
}

// The range a date can show: years -9999 to 9999.
const firstDay = Date.UTC(-9999, 0, 1) / 86_400_000;
const lastDay = Date.UTC(9999, 11, 31) / 86_400_000;

function dateText(days: number): string {
  if (!Number.isInteger(days) || days < firstDay || days > lastDay) {
    return outOfRangeText;
  }
  const date = new Date(days * 86_400_000);
  const year = date.getUTCFullYear();
  return `${year < 0 ? "-" : ""}${pad(year, 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

/** The civil fields of an instant, in seconds since the epoch, in some zone. */
type ZoneParts = (seconds: number) => readonly [number, number, number, number, number, number];

function utcParts(seconds: number): readonly [number, number, number, number, number, number] {
  const date = new Date(seconds * 1000);
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ];
}

function zonePartsFor(zone: string): ZoneParts {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
  } catch {
    throw new FormatError(
      "unknown-zone",
      `Unknown time zone ${zone}: name an IANA zone such as ${defaultZone}.`,
    );
  }
  if (zone === "UTC") {
    return utcParts;
  }
  return (seconds) => {
    const fields: Record<string, number> = {};
    for (const part of formatter.formatToParts(new Date(seconds * 1000))) {
      fields[part.type] = Number(part.value);
    }
    return [
      fields["year"] ?? 0,
      fields["month"] ?? 0,
      fields["day"] ?? 0,
      fields["hour"] ?? 0,
      fields["minute"] ?? 0,
      fields["second"] ?? 0,
    ];
  };
}

// The instants a timestamp can show, as jiff bounds them: -009999-01-02T01:59:59Z to 9999-12-30T22:00:00.999999Z.
const firstSecond = BigInt(Date.UTC(-9999, 0, 2, 1, 59, 59) / 1000);
const lastSecond = BigInt(Date.UTC(9999, 11, 30, 22, 0, 0) / 1000);

function civilText(micros: bigint, parts: ZoneParts, digits: number): string {
  let seconds = micros / 1_000_000n;
  let fraction = micros % 1_000_000n;
  if (fraction < 0n) {
    fraction += 1_000_000n;
    seconds -= 1n;
  }
  if (seconds < firstSecond || seconds > lastSecond) {
    return outOfRangeText;
  }
  const [year, month, day, hour, minute, second] = parts(Number(seconds));
  const text = `${year < 0 ? "-" : ""}${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)} ${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`;
  return digits === 0 ? text : `${text}.${fraction.toString().padStart(6, "0").slice(0, digits)}`;
}
