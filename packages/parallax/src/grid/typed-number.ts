/* A number as the user types it into a column's condition, read the way the column shows numbers: thousands
 * separators, a negative in parentheses, a percent sign or basis points, a `K`, `M` or `B`, and a price in 32nds, and,
 * with no mark of its own, the column's display format, so 5 in a column shown as a percentage is 5%. The number comes
 * back as exact decimal text, which a decimal column takes as it is. */

import type { LayoutFormat } from "#layout/layout.ts";

/** Powers of ten that marks and formats scale by. */
const percentShift = -2;
const bpsShift = -4;
const thousandsShift = 3;
const millionsShift = 6;
const billionsShift = 9;
const suffixShifts: ReadonlyMap<string, number> = new Map([
  ["k", thousandsShift],
  ["m", millionsShift],
  ["mm", millionsShift],
  ["b", billionsShift],
  ["bn", billionsShift],
]);
const abbreviationShifts = {
  billions: billionsShift,
  millions: millionsShift,
  thousands: thousandsShift,
} as const;

/** 32nds, and the finer steps after them: `+` is half a 32nd, and a third digit counts eighths of one. */
const thirtySeconds = 32;
const halfStep = 64;
const eighthStep = 256;

/** Moves the point of exact decimal text `digits`, unsigned, by `shift` places: right for a positive shift. */
function shifted(digits: string, shift: number): string {
  const [whole = "", fraction = ""] = digits.split(".");
  const all = `${whole}${fraction}`;
  const point = whole.length + shift;
  const padded = point < 0 ? `${"0".repeat(-point)}${all}` : all.padEnd(point, "0");
  const at = Math.max(point, 0);
  const head = padded.slice(0, at).replace(/^0+(?=\d)/u, "") || "0";
  const tail = padded.slice(at).replace(/0+$/u, "");
  return tail === "" ? head : `${head}.${tail}`;
}

/** A price in 32nds, such as `99-16+` or `99-165`, as exact decimal text; null when `text` is not one. */
function fromThirtySeconds(text: string): string | null {
  const match = /^(?<whole>\d+)-(?<ticks>\d{1,2})(?<finer>[+\d]?)$/u.exec(text);
  if (match?.groups === undefined) {
    return null;
  }
  const { whole = "0", ticks = "0", finer = "" } = match.groups;
  let finerPart = 0;
  if (finer === "+") {
    finerPart = 1 / halfStep;
  } else if (finer !== "") {
    finerPart = Number(finer) / eighthStep;
  }
  // Each part is a power of two, so the sum is exact in a double and in decimal.
  return String(Number(whole) + Number(ticks) / thirtySeconds + finerPart);
}

/** The power of ten the column's display format writes its numbers at. */
function formatShift(format: LayoutFormat | undefined): number {
  if (format?.percent === true) {
    return percentShift;
  }
  if (format?.bps === true) {
    return bpsShift;
  }
  return format?.abbreviate === null || format?.abbreviate === undefined
    ? 0
    : abbreviationShifts[format.abbreviate];
}

/** Text without its mark of scale, and the power of ten the mark, or else the format, says. */
function scaleOf(
  text: string,
  format: LayoutFormat | undefined,
): { readonly rest: string; readonly shift: number } {
  if (text.endsWith("%")) {
    return { rest: text.slice(0, -1), shift: percentShift };
  }
  const bps = /bps?$/iu.exec(text);
  if (bps !== null) {
    return { rest: text.slice(0, bps.index), shift: bpsShift };
  }
  const suffix = /(?<=\d)(?<mark>mm|bn|[kmb])$/iu.exec(text);
  const shift = suffixShifts.get(suffix?.groups?.["mark"]?.toLowerCase() ?? "");
  if (suffix !== null && shift !== undefined) {
    return { rest: text.slice(0, suffix.index), shift };
  }
  return { rest: text, shift: formatShift(format) };
}

/** Whether typed text is negative, by a minus sign or parentheses, and the text without them. */
function signOf(text: string): { readonly negative: boolean; readonly rest: string } {
  const parenthesised = /^\(.*\)$/u.test(text);
  const inner = parenthesised ? text.slice(1, -1) : text;
  return { negative: parenthesised || inner.startsWith("-"), rest: inner.replace(/^[-+]/u, "") };
}

/** A number the user typed, as exact decimal text, read as a column with `format` shows numbers; null when it is not
 * one. */
function typedNumber(text: string, format: LayoutFormat | undefined): string | null {
  const { negative, rest } = signOf(text.replaceAll(/[\s,]/gu, ""));
  const price = format?.thirty_seconds === undefined ? null : fromThirtySeconds(rest);
  const scale = price === null ? scaleOf(rest, format) : { rest: price, shift: 0 };
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(scale.rest)) {
    return null;
  }
  const value = shifted(scale.rest, scale.shift);
  return negative && value !== "0" ? `-${value}` : value;
}

export { typedNumber };
