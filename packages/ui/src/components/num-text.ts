/* The text the number components show, through the formatter, so a value reads as it does in parallax's grid. Every
 * number an API sends is a double, and the formatter rounds it once, for display: to 15 significant digits, half away
 * from zero, then to the decimals shown. Basis points and prices in 32nds are the formatter's own formats, so `Bps` and
 * `Price32` read as the grid's columns in those formats do. A rate is a fraction: `Pct` shows 0.0525 as 5.25% and
 * `Bps` 0.0025 as 25 bp. Currencies and the sign of a signed value are added around the formatter's text. */

import { createFormatter, nullText, undefinedText } from "#format/format.ts";
import type { Abbreviation, Format, Formatter, Negative, SuffixStyle } from "#format/format.ts";
import { parseDecimal } from "#numbers/decimal-text.ts";
import type { Rounding } from "#numbers/rounding.ts";
import { formatThirtySeconds } from "#numbers/thirty-seconds.ts";
import type { ThirtySecondsPrecision } from "#numbers/thirty-seconds.ts";

/** A number as an API sends it: a double. `null` and `undefined`, and NaN, show the formatter's text for null. */
type NumericValue = number | null | undefined;

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

/** A present value's text through a formatter. */
function formattedText(value: number, formatter: Formatter): string {
  return formatter.float(value);
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

/** Exact decimal text, such as what AmountInput read, written by the formatter at its own scale: `1500000` is
 * `1,500,000` and `0.0025` stays `0.0025`. */
function exactText(text: string): string {
  const { scale, unscaled } = parseDecimal(text);
  return numberFormatter({}).decimal(unscaled, scale);
}

/** A number as text, for a string such as a toast's or an accessible name, by the same rule `Num` shows it with:
 * `numberText(150000, { decimals: 0 })` is `150,000`. */
function numberText(value: NumericValue, format: NumberFormat = {}): string {
  return numText(value, format).text;
}

/** A rate as `Pct` shows it: a fraction multiplied by 100 with `%`, so 0.0525 is 5.25%. */
function pctText(value: NumericValue, format: NumberFormat = {}): Shown {
  if (value === null || value === undefined) {
    return noValue;
  }
  return shown(formattedText(value, numberFormatter(format, { percent: true })));
}

/** A rate as `Bps` shows it, through the formatter's basis points: 0.0025 is `25 bp`, and `(25 bp)` a negative in
 * parentheses. The point moves four places after the formatter reads the value at 15 digits. */
function bpsText(value: NumericValue, format: NumberFormat = {}): Shown {
  if (value === null || value === undefined) {
    return noValue;
  }
  return shown(formattedText(value, numberFormatter(format, { bps: true })));
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
  if (!Number.isFinite(value)) {
    return shown(undefinedText);
  }
  return shown(formatThirtySeconds(value, { precision, rounding }));
}

export { bpsText, exactText, moneyText, numberText, numText, pctText, price32Text, signedText };
export type { Direction, NumberFormat, NumericValue, PriceFormat, Shown };
