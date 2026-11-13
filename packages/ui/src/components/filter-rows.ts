/* Which rows a page's active filters keep: each filter reads its field from a row through the page's accessor, and a
 * row stays when every active filter takes its field. Text matches the text a field shows, ignoring case; a choice, the
 * option's value; a date range, a `Temporal.PlainDate` or ISO 8601 text between its ends, an instant by its date in
 * New York, as `DateTime` shows it; a number range, a number between its ends. A field with no value, `null` or
 * `undefined`, passes no active filter. */

import { shownDate } from "./date-time-text.ts";
import { chosenOf, isDateRangeValue, isNumberRangeValue } from "./filter-definitions.ts";
import type {
  DateRangeFilterValue,
  FilterDefinition,
  FilterDefinitions,
  FilterValues,
  NumberRangeFilterValue,
} from "./filter-definitions.ts";

/** What a field of a row gives a filter: its text, its option's value or values, a date, or a number. */
type FilterCell = string | number | Temporal.PlainDate | readonly string[] | null | undefined;

/** How each filter reads its field from a row, by the filter's name. */
type FilterFields<TRow, TFilters extends FilterDefinitions> = {
  readonly [TName in keyof TFilters]: (row: TRow) => FilterCell;
};

/** A cell's texts: the text, each of a list, or none. */
function textsOf(cell: FilterCell): readonly string[] {
  if (typeof cell === "string") {
    return [cell];
  }
  if (Array.isArray(cell)) {
    return cell.filter((item): item is string => typeof item === "string");
  }
  return [];
}

/** A cell's date as ISO 8601 text, which orders as the dates do: the date `DateTime` shows for it, so an instant's is
 * its date in New York, not the UTC date its text begins with. */
function dateOf(cell: FilterCell): string | undefined {
  if (cell instanceof Temporal.PlainDate) {
    return cell.toString();
  }
  return typeof cell === "string" ? shownDate(cell)?.toString() : undefined;
}

function inDateRange(cell: FilterCell, { start, end }: DateRangeFilterValue): boolean {
  const day = dateOf(cell);
  return day !== undefined && start <= day && day <= end;
}

function inNumberRange(cell: FilterCell, { min, max }: NumberRangeFilterValue): boolean {
  return (
    typeof cell === "number" &&
    !Number.isNaN(cell) &&
    (min === undefined || cell >= min) &&
    (max === undefined || cell <= max)
  );
}

/** Whether a field's cell passes one active filter's value; a value not of the filter's kind passes nothing. */
function matchesFilter(definition: FilterDefinition, value: unknown, cell: FilterCell): boolean {
  switch (definition.kind) {
    case "text": {
      const wanted = typeof value === "string" ? value.toLocaleLowerCase() : undefined;
      return (
        wanted !== undefined &&
        textsOf(cell).some((text) => text.toLocaleLowerCase().includes(wanted))
      );
    }
    case "choice": {
      return typeof value === "string" && textsOf(cell).includes(value);
    }
    case "multiChoice": {
      const chosen = chosenOf(value);
      return textsOf(cell).some((text) => chosen.includes(text));
    }
    case "dateRange": {
      return isDateRangeValue(value) && inDateRange(cell, value);
    }
    case "numberRange": {
      return isNumberRangeValue(value) && inNumberRange(cell, value);
    }
    default: {
      return false;
    }
  }
}

interface FilterRowsOptions<TRow, TFilters extends FilterDefinitions> {
  /** The page's filters, as `defineFilters` returned them. */
  readonly filters: TFilters;
  /** The active filters, as `useFilters` gives them in `values`. */
  readonly values: FilterValues<TFilters>;
  /** How each filter reads its field from a row. */
  readonly fields: FilterFields<TRow, TFilters>;
}

/** The rows every active filter keeps, in their order. A row's field passes text that it holds, ignoring case; the
 * option chosen, or any of those chosen; or a date or number inside the range. With no filter active it returns
 * `rows` itself.
 *
 * @use For a page's own filtering of rows it holds, such as a Table's or a DataTable's data under a FilterBar. Rows an
 * API filters are filtered there: send it the values instead.
 * @see FilterBar, useFilters, defineFilters, DataTable */
function filterRows<TRow, TFilters extends FilterDefinitions>(
  rows: readonly TRow[],
  { filters, values, fields }: FilterRowsOptions<TRow, TFilters>,
): readonly TRow[] {
  const held: Readonly<Record<string, unknown>> = values;
  const active = Object.entries(held).flatMap(([name, value]) => {
    const definition = filters[name];
    const field = fields[name];
    return definition === undefined || field === undefined || value === undefined
      ? []
      : [{ definition, field, value }];
  });
  if (active.length === 0) {
    return rows;
  }
  return rows.filter((row) =>
    active.every(({ definition, field, value }) => matchesFilter(definition, value, field(row))),
  );
}

export { filterRows, matchesFilter };
export type { FilterCell, FilterFields, FilterRowsOptions };
