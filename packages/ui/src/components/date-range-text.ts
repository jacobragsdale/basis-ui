/* What DateRangePicker's parts share about a range: how its button writes one, the range two picked or typed days
 * give, in either order, and whether two ranges are the same days. */

import type { DateRange } from "#dates/periods.ts";

import { readDate, whyNotPickable } from "./date-picking.ts";
import type { PickRules } from "./date-picking.ts";

/** A range as the button writes it: `2026-10-01 – 2026-11-06`. */
function rangeText(range: DateRange): string {
  return `${range.start.toString()} – ${range.end.toString()}`;
}

/** The range from two picked days, in either order. */
function rangeOf(first: Temporal.PlainDate, second: Temporal.PlainDate): DateRange {
  return Temporal.PlainDate.compare(first, second) <= 0
    ? { end: second, start: first }
    : { end: first, start: second };
}

/** Whether two optional ranges are the same days. */
function sameRange(left: DateRange | null, right: DateRange | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.start.equals(right.start) && left.end.equals(right.end);
}

/** What two typed dates give: a range, in either order, or the first reason one of them cannot be taken. */
function typedRange(
  from: string,
  to: string,
  rules: PickRules,
): { readonly range: DateRange } | { readonly reason: string } {
  const readings = [readDate(from), readDate(to)] as const;
  const [start, end] = readings;
  if (!start.ok) {
    return { reason: start.reason };
  }
  if (!end.ok) {
    return { reason: end.reason };
  }
  const reason = whyNotPickable(start.value, rules) ?? whyNotPickable(end.value, rules);
  if (reason !== undefined) {
    return { reason };
  }
  return { range: rangeOf(start.value, end.value) };
}

export { rangeOf, rangeText, sameRange, typedRange };
