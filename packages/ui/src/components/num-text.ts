/* The text the number components show, through the formatter, so a value reads as it does in parallax's grid. Each
 * value type APIs send takes the formatter's path for it: decimal strings and Decimals the exact decimal path, doubles
 * the 15-digit float path, and bigints the integer path. Basis points and prices in 32nds are the formatter's own
 * formats, so `Bps` and `Price32` read as the grid's columns in those formats do. Percentages of a percent unit,
 * currencies and the sign of a signed value are added around the formatter's text, never by rounding a double.
 *
 * A Decimal is read by its shape, `unscaled` and `scale`, rather than with `instanceof`, because `@basis/ui/numbers`
 * and the package's root can load two copies of the class: the source and the build. */

import { createFormatter, nullText, undefinedText } from "#format/format.ts";
import type {
  Abbreviation,
  BpsUnit,
  Format,
  Formatter,
  Negative,
  SuffixStyle,
} from "#format/format.ts";
import { Decimal } from "#numbers/decimal.ts";
import { percentToFraction } from "#numbers/rates.ts";
import type { Rounding } from "#numbers/rounding.ts";
import { formatThirtySeconds } from "#numbers/thirty-seconds.ts";
import type { ThirtySecondsPrecision } from "#numbers/thirty-seconds.ts";

/** An exact decimal, as `Decimal` holds one: `unscaled × 10^-scale`. */
interface DecimalLike {
  readonly unscaled: bigint;
  readonly scale: number;
}

/** A number as APIs send it: decimal text such as `"-1234.50"`, a `Decimal`, a double, or an integer as a bigint.
 * `null` and `undefined` show the formatter's text for null. */
type NumericValue = string | DecimalLike | number | bigint | null | undefined;

/** How a number is written, as the formatter's `Format` has it. */
interface NumberFormat {
  /** Digits after the point; each value type's default unless set. */
  readonly decimals?: number | undefined;
  /** Group thousands with commas; yes unless set. */
  readonly thousands?: boolean | undefined;
  /** Divide by a thousand, million or billion and show the suffix. */
  readonly abbreviate?: Abbreviation | undefined;
  /** `par` writes the abbreviation as bond markets write par amounts, `M`, `MM` and `BN`; `amount`'s `K`, `M` and `B`
   * unless set. */
  readonly suffixes?: SuffixStyle | undefined;
  /** `-1,234.50` or `(1,234.50)`; `minus` unless set. */
  readonly negative?: Negative | undefined;
}

/** Which way a shown value points: a gain, a loss, or neither, for zero and an undefined result. */
type Direction = "gain" | "loss" | "none";

/** The text a number shows and the way it points. */
interface Shown {
  readonly text: string;
  readonly direction: Direction;
}

/** The unit a rate arrives in. A fraction is the formatter's and the rate parser's unit: 0.0525 is 5.25%. */
type PercentUnit = "fraction" | "percent";

const percentPerWhole = 100;
/** The formatter's cached for each distinct format; formats in an app are few, so the cache stays small. */
const formatterCacheSize = 64;
const formatters = new Map<string, Formatter>();

/** The formatter for a format, made once. `createFormatter` builds a time zone formatter, too costly per cell. */
function formatterFor(format: Format): Formatter {
  const key = JSON.stringify([
    format.decimals,
    format.thousands,
    format.percent,
    format.abbreviate,
    format.suffixes,
    format.bps,
    format.thirtySeconds,
    format.negative,
  ]);
  const cached = formatters.get(key);
  if (cached !== undefined) {
    return cached;
  }
  if (formatters.size >= formatterCacheSize) {
    formatters.clear();
  }
  const made = createFormatter(format);
  formatters.set(key, made);
  return made;
}

/** The formatter for a number format, leaving what is unset to the formatter's defaults, with a style of the
 * formatter's own: a percentage, basis points, or a price in 32nds. */
function numberFormatter(
  format: NumberFormat,
  style: Pick<Format, "percent" | "bps" | "thirtySeconds"> = {},
): Formatter {
  return formatterFor({
    abbreviate: format.abbreviate ?? null,
    decimals: format.decimals ?? null,
    negative: format.negative ?? "minus",
    suffixes: format.suffixes ?? "amount",
    thousands: format.thousands ?? null,
    ...style,
  });
}

/** A decimal string or a Decimal as a Decimal of this module's copy of the class. Throws `SyntaxError` for text that is
 * not a decimal number, as `Decimal.from` does: a response's schema should have rejected it. */
function decimalOf(value: string | DecimalLike): Decimal {
  if (typeof value === "string") {
    return Decimal.from(value);
  }
  return Decimal.from(value.unscaled, value.scale);
}

/** A present value's text through a formatter, on the path its type takes. */
function formattedText(
  value: string | DecimalLike | number | bigint,
  formatter: Formatter,
): string {
  if (typeof value === "number") {
    return formatter.float(value);
  }
  if (typeof value === "bigint") {
    return formatter.integer(value);
  }
  const decimal = decimalOf(value);
  return formatter.decimal(decimal.unscaled, decimal.scale);
}

/** The way a formatted number points: a minus or parentheses is a loss, any other non-zero digit a gain. */
function directionOf(text: string): Direction {
  if (text.startsWith("-") || text.startsWith("(")) {
    return "loss";
  }
  return /[1-9∞]/u.test(text) ? "gain" : "none";
}

/** The text with a plus sign before a gain, since a signed value always shows its sign. */
function signedText(text: string, direction: Direction): string {
  return direction === "gain" ? `+${text}` : text;
}

/** What a missing value shows: the formatter's text for null. */
const noValue: Shown = { direction: "none", text: nullText };

/** A formatted number with the way it points. */
function shown(text: string): Shown {
  return { direction: directionOf(text), text };
}

/** A number as `Num` shows it. */
function numText(value: NumericValue, format: NumberFormat = {}): Shown {
  if (value === null || value === undefined) {
    return noValue;
  }
  return shown(formattedText(value, numberFormatter(format)));
}

/** A rate as a fraction, at no loss: a percentage's point moves exactly, and a double is divided, which the
 * formatter's 15 significant digits then read back exactly. */
function fractionFromPercent(value: string | DecimalLike | number | bigint): Decimal | number {
  if (typeof value === "number") {
    return value / percentPerWhole;
  }
  return percentToFraction(typeof value === "bigint" ? Decimal.from(value) : decimalOf(value));
}

/** A rate as `Pct` shows it: a fraction multiplied by 100 with `%`, so 0.0525 is 5.25%. */
function pctText(
  value: NumericValue,
  format: NumberFormat = {},
  unit: PercentUnit = "fraction",
): Shown {
  if (value === null || value === undefined) {
    return noValue;
  }
  const fraction = unit === "percent" ? fractionFromPercent(value) : value;
  return shown(formattedText(fraction, numberFormatter(format, { percent: true })));
}

/** A rate as `Bps` shows it, through the formatter's basis points: 0.0025 is `25 bp`, and `(25 bp)` a negative in
 * parentheses. A fraction's point moves four places after the formatter reads it, so a decimal keeps every digit. */
function bpsText(
  value: NumericValue,
  format: NumberFormat = {},
  unit: BpsUnit = "fraction",
): Shown {
  if (value === null || value === undefined) {
    return noValue;
  }
  return shown(formattedText(value, numberFormatter(format, { bps: unit })));
}

/** A currency's symbol and minor units, as US English writes them: `$` and 2 for USD, `€` and 2 for EUR, `¥` and 0
 * for JPY. Throws `RangeError` for a code that is not a currency. */
function currencyOf(currency: string): { readonly symbol: string; readonly decimals: number } {
  const format = new Intl.NumberFormat("en-US", { currency, style: "currency" });
  const symbol = format.formatToParts(0).find((part) => part.type === "currency")?.value;
  const decimals = format.resolvedOptions().maximumFractionDigits ?? 2;
  return { decimals, symbol: symbol ?? currency };
}

/** Puts a currency's symbol after the sign: `$1,234.50`, `-$1,234.50`, `($1,234.50)`; a symbol of letters, such as
 * `CHF`, takes a space. */
function withSymbol(text: string, symbol: string): string {
  if (text === undefinedText) {
    return text;
  }
  const mark = /\p{L}$/u.test(symbol) ? `${symbol} ` : symbol;
  const sign = /^[-(]/u.exec(text)?.[0] ?? "";
  return `${sign}${mark}${text.slice(sign.length)}`;
}

/** An amount as `Money` shows it: with the currency's symbol, at its minor units unless abbreviated or told
 * otherwise. */
function moneyText(value: NumericValue, currency: string, format: NumberFormat = {}): Shown {
  if (value === null || value === undefined) {
    return noValue;
  }
  const { decimals, symbol } = currencyOf(currency);
  const places = format.decimals ?? (format.abbreviate === undefined ? decimals : undefined);
  const text = formattedText(value, numberFormatter({ ...format, decimals: places }));
  return shown(withSymbol(text, symbol));
}

/** How `Price32` writes a price. */
interface PriceFormat {
  /** The finest step shown; eighths of a 32nd unless set. */
  readonly precision?: ThirtySecondsPrecision | undefined;
  /** How a price between steps rounds; half away from zero unless set. */
  readonly rounding?: Rounding | undefined;
}

/** A 256th of a point needs eight decimals, so a double price reads exactly at this scale. */
const priceScale = 8;

/** A price as a Decimal; a double is read at eight decimals, enough for any 256th of a point. */
function priceOf(value: string | DecimalLike | number | bigint, rounding: Rounding): Decimal {
  if (typeof value === "number") {
    return Decimal.fromNumber(value, priceScale, rounding);
  }
  return typeof value === "bigint" ? Decimal.from(value) : decimalOf(value);
}

/** A Treasury price as `Price32` shows it: `99-16+`. A double that is not finite has no price, and shows the
 * formatter's text for an undefined result. Rounded half away from zero, as by default, it is the formatter's 32nds,
 * which the grid writes; another rounding is the price's own. */
function price32Text(value: NumericValue, format: PriceFormat = {}): Shown {
  if (value === null || value === undefined) {
    return noValue;
  }
  const precision = format.precision ?? "eighths";
  const rounding = format.rounding ?? "half-away-from-zero";
  if (rounding === "half-away-from-zero") {
    return shown(formattedText(value, numberFormatter({}, { thirtySeconds: precision })));
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return shown(undefinedText);
  }
  return shown(formatThirtySeconds(priceOf(value, rounding), { precision, rounding }));
}

export { bpsText, moneyText, numText, pctText, price32Text, signedText };
export type { BpsUnit } from "#format/format.ts";
export type { DecimalLike, Direction, NumberFormat, NumericValue, PercentUnit, PriceFormat, Shown };
