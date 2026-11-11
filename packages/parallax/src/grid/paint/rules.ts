/* What a rich cell reads: its value as a number, its column's domain, and the first of its column's rules its value
 * meets, with a filter's operators. The engine gives a flat view's domains; a detail view's are the frame's rows'. */

import type { CellValue } from "#frame/cell.ts";
import type { FrameColumn } from "#frame/columns.ts";
import type { FrameData } from "#frame/frame.ts";
import type { LayoutRule } from "#layout/cells.ts";
import type { LayoutScalar } from "#layout/layout.ts";

/** A column's least and greatest value. */
type Domain = readonly [low: number, high: number];

const decimalBase = 10;

/** A value as a number, or null for one that is not a number. */
function numberOf(value: CellValue): number | null {
  if (value.kind === "number") {
    return value.value;
  }
  if (value.kind === "integer") {
    return Number(value.value);
  }
  return value.kind === "decimal" ? Number(value.unscaled) / decimalBase ** value.scale : null;
}

/** The domains a frame's rows give, by data column, for a view the engine gives none. */
const frameDomains = new WeakMap<FrameData, Map<number, Domain | null>>();

/** The least and greatest of `data`'s values over the frame's rows. */
function rowsDomain(data: FrameColumn, rows: number): Domain | null {
  let [low, high] = [Infinity, -Infinity];
  for (let row = 0; row < rows; row += 1) {
    const value = numberOf(data.value(row));
    if (value !== null) {
      [low, high] = [Math.min(low, value), Math.max(high, value)];
    }
  }
  return low <= high ? [low, high] : null;
}

/** The domain a frame's rows give data column `index`, kept for the frame. */
function rowsDomainOf(frame: FrameData, index: number): Domain | null {
  let known = frameDomains.get(frame);
  if (known === undefined) {
    known = new Map();
    frameDomains.set(frame, known);
  }
  const data = frame.columns[index];
  if (!known.has(index) && data !== undefined) {
    known.set(index, rowsDomain(data, frame.rowCount));
  }
  return known.get(index) ?? null;
}

/** Data column `index`'s domain in `frame`: the engine's over the rows that pass the filters, else the frame's rows'. */
function domainOf(frame: FrameData, index: number): Domain | null {
  const given = frame.domains?.[index];
  if (given === undefined) {
    return rowsDomainOf(frame, index);
  }
  const [low, high] = [numberOf(given.value(0)), numberOf(given.value(1))];
  return low === null || high === null ? null : [low, high];
}

/** How `value` compares with an operand: by number when both are numbers, else by text, ignoring case. */
function compare(value: CellValue, text: string, operand: LayoutScalar): number | null {
  const number = numberOf(value);
  if (number !== null && typeof operand === "number") {
    return number - operand;
  }
  if (operand === null) {
    return null;
  }
  return text.toLowerCase().localeCompare(String(operand).toLowerCase());
}

/** Whether a cell of `value`, shown as `text`, meets an ordering operator. */
function ordered(op: string, difference: number | null): boolean {
  if (difference === null) {
    return false;
  }
  const tests: Readonly<Record<string, boolean>> = {
    eq: difference === 0,
    ge: difference >= 0,
    gt: difference > 0,
    le: difference <= 0,
    lt: difference < 0,
    ne: difference !== 0,
  };
  return tests[op] ?? false;
}

/** Whether a cell's text meets a text operator, ignoring case. */
function texts(op: string, text: string, operand: LayoutScalar): boolean | null {
  const [cell, wanted] = [text.toLowerCase(), String(operand ?? "").toLowerCase()];
  const tests: Readonly<Record<string, boolean>> = {
    contains: cell.includes(wanted),
    ends_with: cell.endsWith(wanted),
    not_contains: !cell.includes(wanted),
    starts_with: cell.startsWith(wanted),
  };
  return tests[op] ?? null;
}

/** Whether a cell of `value`, shown as `text`, meets a rule's condition. */
function meets(when: LayoutRule["when"], value: CellValue, text: string): boolean {
  const empty = value.kind === "null";
  if (when.op === "is_null" || when.op === "is_not_null") {
    return empty === (when.op === "is_null");
  }
  if (empty) {
    return false;
  }
  if (when.op === "in" || when.op === "not_in") {
    const found = when.values.some((operand) => compare(value, text, operand) === 0);
    return found === (when.op === "in");
  }
  return texts(when.op, text, when.value) ?? ordered(when.op, compare(value, text, when.value));
}

/** The format of the first of `rules` a cell of `value`, shown as `text`, meets, or null. */
function ruleFor(
  rules: readonly LayoutRule[] | undefined,
  value: CellValue,
  text: string,
): LayoutRule["format"] | null {
  return rules?.find((rule) => meets(rule.when, value, text))?.format ?? null;
}

export { domainOf, meets, numberOf, ruleFor };
export type { Domain };
