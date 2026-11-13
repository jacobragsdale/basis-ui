/* What FileImport's preview says will be sent for a cell, where that differs from the cell's text: the schema may read
 * `5M` as 5,000 or `FALSE` as `true`, and the user confirms what the app receives, not what the file says. A number
 * written as plain decimal text, such as `99.50`, and a boolean or text that reads as itself are not repeated. */

import { exactText } from "./num-text.ts";

/** Plain decimal text, with or without grouping commas, as a CSV writes a number. */
const plainDecimal = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/u;

/** A value as the preview writes it: a number in full with its grouping, a date or time as ISO 8601, and anything
 * else as JSON. */
function valueText(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? exactText(String(value)) : String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "nothing";
  }
  // A Date, and Temporal's types, write themselves as ISO 8601 through `toJSON`.
  return JSON.stringify(value) ?? "nothing";
}

/** Whether a cell's text already reads as the value, so the preview need not say it again. */
function readsAs(cell: string, value: unknown): boolean {
  if (typeof value === "number") {
    return plainDecimal.test(cell) && Number(cell.replaceAll(",", "")) === value;
  }
  if (typeof value === "boolean") {
    return cell.toLowerCase() === String(value);
  }
  if (value === undefined || value === null) {
    return cell === "";
  }
  return valueText(value) === cell;
}

/** What will be sent for a cell, as the preview shows it, or `undefined` when the cell's text already says it. */
function sentText(cell: string, value: unknown): string | undefined {
  return readsAs(cell, value) ? undefined : valueText(value);
}

export { sentText };
