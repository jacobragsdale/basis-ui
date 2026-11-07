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
// `YYYY-MM-DDTHH:MM:SS` and `YYYY-MM-DD`, the parts of an ISO string a path keeps.
const secondsLength = 19;
const dateLength = 10;
const microDigits = 6;

/** Writes an unscaled decimal exactly, without grouping, such as `-1234.50`. */
function exactDecimal(unscaled: bigint, scale: number): string {
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
  const whole = new Date(Number(seconds) * millisPerSecond).toISOString().slice(0, secondsLength);
  return `${whole}.${fraction.toString().padStart(microDigits, "0")}${zoned ? "Z" : ""}`;
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
      return new Date(value.days * millisPerDay).toISOString().slice(0, dateLength);
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
