/* Exact conversions of cell values, for layouts and for colouring.
 *
 * Display text is not made here: the engine formats every cell by the rules the Excel export uses and sends the text
 * in the frame. These helpers turn values into the exact JSON a layout's group paths hold, and read the sign of
 * display text. */

import type { CellValue } from "#frame/cell.ts";

const zero = 0n;
const one = 1n;
const microsPerSecond = 1_000_000n;
const millisPerSecond = 1000;
const millisPerDay = 86_400_000;
const microDigits = 6;
/** What an ISO string ends with past the second, and past the day: `.sssZ` and `THH:MM:SS.sssZ`. */
const pastSecond = 5;
const pastDay = 14;
/** The first and last days the engine reads a date path of, -9999-01-01 and 9999-12-31, as days since the epoch:
 * years past four digits are outside it. */
const firstDay = -4_371_587;
const lastDay = 2_932_896;
const millisFrom = firstDay * millisPerDay;
const millisUntil = (lastDay + 1) * millisPerDay;

/** Writes an unscaled decimal exactly, without grouping, such as `-1234.50`; a negative scale counts tens, so 5 at
 * scale -2 is `500`. */
function exactDecimal(unscaled: bigint, scale: number): string {
  if (scale < 0) {
    return unscaled === zero ? "0" : `${unscaled.toString()}${"0".repeat(-scale)}`;
  }
  const negative = unscaled < zero;
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale > 0 ? `.${digits.slice(digits.length - scale)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** Microseconds since the epoch, exactly: RFC 3339 with `Z` for instants, and a civil date-time for wall-clock
 * values. */
function timestampText(micros: bigint, zoned: boolean): string {
  let seconds = micros / microsPerSecond;
  let fraction = micros % microsPerSecond;
  if (fraction < zero) {
    fraction += microsPerSecond;
    seconds -= one;
  }
  const millis = Number(seconds) * millisPerSecond;
  // Outside the years the engine reads, the number itself, which it refuses rather than matching another group.
  if (millis < millisFrom || millis >= millisUntil) {
    return micros.toString();
  }
  const whole = new Date(millis).toISOString().slice(0, -pastSecond);
  return `${whole}.${fraction.toString().padStart(microDigits, "0")}${zoned ? "Z" : ""}`;
}

/** A date as a path holds it: an ISO day, or, outside the years -9999 to 9999 that the engine reads, its number of
 * days, which the engine refuses rather than matching another group. */
function dateText(days: number): string {
  if (days < firstDay || days > lastDay) {
    return String(days);
  }
  // A year before 0 is written with its sign and six digits, as `-000001-01-01`.
  return new Date(days * millisPerDay).toISOString().slice(0, -pastDay);
}

/** A double as a path holds it: infinities as `"inf"` and `"-inf"`, and NaN, which no group has, as `"NaN"`, which
 * the engine refuses rather than matching another group. */
function numberPath(value: number): string | number {
  if (Number.isNaN(value)) {
    return "NaN";
  }
  if (Number.isFinite(value)) {
    return value;
  }
  return value > 0 ? "inf" : "-inf";
}

/**
 * Converts a group value to the JSON a layout path holds, exactly: decimals and integers past 2^53 as strings,
 * infinities as `"inf"` and `"-inf"`, timestamps to the microsecond.
 */
function pathValue(value: CellValue): string | number | boolean | null {
  switch (value.kind) {
    case "null": {
      return null;
    }
    case "number": {
      return numberPath(value.value);
    }
    case "integer": {
      return Number.isSafeInteger(Number(value.value))
        ? Number(value.value)
        : value.value.toString();
    }
    case "decimal": {
      return exactDecimal(value.unscaled, value.scale);
    }
    case "text":
    case "boolean": {
      return value.value;
    }
    case "date": {
      return dateText(value.days);
    }
    case "timestamp": {
      return timestampText(value.micros, value.zoned);
    }
    default: {
      return value satisfies never;
    }
  }
}

/**
 * Whether display text shows a negative number, which draws in the negative colour. The text decides, not the value:
 * -0.001 at two decimals shows as an unsigned 0.00 and is not coloured.
 */
function isNegativeText(text: string): boolean {
  return text.startsWith("-") || text.startsWith("(");
}

export { exactDecimal, isNegativeText, pathValue, timestampText };
