/* A filter bar's filters: each a field of the page's data, by name, with its kind, and the value an active filter
 * holds. The names are the page's search parameters, so a filtered view is a link. Every value is plain JSON, dates as
 * ISO 8601 text, so a saved view stores one as it is and the address holds it as the router writes JSON. */

import type { Calendar } from "#dates/calendar.ts";
import type { Suffixes } from "#format/parse.ts";

import type { DateRangePreset } from "./date-range-presets.ts";

/** One of a choice's options: its value in the address, or the value with the label the page shows for it. */
type FilterOption<TValue extends string = string> =
  | TValue
  | { readonly value: TValue; readonly label: string };

/** Free text that a field must hold, ignoring case, such as part of an issuer's name. */
interface TextFilter {
  readonly kind: "text";
  /** The field's name on the page, such as "Issuer". */
  readonly label: string;
  /** The input's text while it is empty; none unless set. */
  readonly placeholder?: string | undefined;
}

/** One of a list of options, such as a book. */
interface ChoiceFilter<TValue extends string = string> {
  readonly kind: "choice";
  /** The field's name on the page, such as "Book". */
  readonly label: string;
  /** The options, in the order the list shows them. */
  readonly options: readonly FilterOption<TValue>[];
}

/** Any of a list of options, such as several desks. */
interface MultiChoiceFilter<TValue extends string = string> {
  readonly kind: "multiChoice";
  /** The field's name on the page, such as "Desks". */
  readonly label: string;
  /** The options, in the order the list shows them. */
  readonly options: readonly FilterOption<TValue>[];
}

/** A range of business days, such as the days a trade settles in, picked with DateRangePicker. */
interface DateRangeFilter {
  readonly kind: "dateRange";
  /** The field's name on the page, such as "Settles". */
  readonly label: string;
  /** The calendar whose business days the picker takes; SIFMA's unless set. */
  readonly calendar?: Calendar | undefined;
  /** The earliest date the picker takes; none unless set. */
  readonly min?: Temporal.PlainDate | undefined;
  /** The latest date the picker takes: none unless set, since a filter may look ahead, as at a coupon's payment. */
  readonly max?: Temporal.PlainDate | undefined;
  /** The presets the picker offers; all six unless set. */
  readonly presets?: readonly DateRangePreset[] | undefined;
}

/** A range of numbers, either end open, typed as AmountInput reads them, so `5mm` is 5,000,000. */
interface NumberRangeFilter {
  readonly kind: "numberRange";
  /** The field's name on the page, such as "Par". */
  readonly label: string;
  /** The suffixes the two inputs accept; `amountSuffixes` unless set. */
  readonly suffixes?: Suffixes | undefined;
}

/** One filter: its kind, its label and what the kind needs. */
type FilterDefinition =
  | TextFilter
  | ChoiceFilter
  | MultiChoiceFilter
  | DateRangeFilter
  | NumberRangeFilter;

/** A page's filters by name; each name is a search parameter of the page's address, in the order the bar shows them. */
type FilterDefinitions = Readonly<Record<string, FilterDefinition>>;

/** An active date range filter: the first and last days it takes, as ISO 8601 dates such as `2026-11-09`. */
interface DateRangeFilterValue {
  readonly start: string;
  readonly end: string;
}

/** An active number range filter: the least and greatest numbers it takes, at least one of them. */
interface NumberRangeFilterValue {
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

/** The value an option gives, from its plain text or its `value`. */
type OptionValue<TOption> = TOption extends { readonly value: infer TValue } ? TValue : TOption;

/** What an active filter of a definition holds: the text, the option's value, the options' values, or the range. */
type FilterValue<TDefinition extends FilterDefinition> = TDefinition extends {
  readonly kind: "text";
}
  ? string
  : TDefinition extends { readonly kind: "choice"; readonly options: readonly (infer TOption)[] }
    ? OptionValue<TOption>
    : TDefinition extends {
          readonly kind: "multiChoice";
          readonly options: readonly (infer TOption)[];
        }
      ? readonly OptionValue<TOption>[]
      : TDefinition extends { readonly kind: "dateRange" }
        ? DateRangeFilterValue
        : NumberRangeFilterValue;

/** The page's active filters, by name; a filter that is not active is absent. It is plain JSON, as the address holds it,
 * a saved view stores it and a table takes it. */
type FilterValues<TFilters extends FilterDefinitions> = {
  readonly [TName in keyof TFilters]?: FilterValue<TFilters[TName]> | undefined;
};

/** Any value a filter holds. */
type AnyFilterValue = string | readonly string[] | DateRangeFilterValue | NumberRangeFilterValue;

/** Whether a value is a date range filter's, as the address or a saved view holds one. */
function isDateRangeValue(value: unknown): value is DateRangeFilterValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "start" in value &&
    typeof value.start === "string" &&
    "end" in value &&
    typeof value.end === "string"
  );
}

/** Whether a value is a number range filter's: an object whose `min` and `max`, each optional, are numbers. */
function isNumberRangeValue(value: unknown): value is NumberRangeFilterValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const min = "min" in value ? value.min : undefined;
  const max = "max" in value ? value.max : undefined;
  return (
    (min === undefined || typeof min === "number") && (max === undefined || typeof max === "number")
  );
}

/** A value's options, when it is a list of text, or none. */
function chosenOf(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** An option as its value and its label. */
interface Option {
  readonly value: string;
  readonly label: string;
}

/** A choice's options, each as its value and label. */
function optionsOf(definition: ChoiceFilter | MultiChoiceFilter): readonly Option[] {
  return definition.options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option,
  );
}

/** The label of the option whose value is `value`, or the value itself when no option has it. */
function optionLabel(definition: ChoiceFilter | MultiChoiceFilter, value: string): string {
  return optionsOf(definition).find((option) => option.value === value)?.label ?? value;
}

/** Why a choice's options cannot be shown, as an ERROR line with the fix, or `undefined` when they can. */
function optionsProblem(
  name: string,
  definition: ChoiceFilter | MultiChoiceFilter,
): string | undefined {
  const values = optionsOf(definition).map((option) => option.value);
  if (values.length === 0) {
    return `ERROR the filter ${name} has no options. Give it at least one in options.`;
  }
  if (values.includes("")) {
    return `ERROR the filter ${name} has an option whose value is empty. Give each option a value, since an empty one cannot be told from no choice.`;
  }
  const twice = values.find((value, index) => values.indexOf(value) !== index);
  return twice === undefined
    ? undefined
    : `ERROR the filter ${name} lists the option ${twice} twice. Give each option its own value.`;
}

/** Why a filter cannot be shown, as an ERROR line with the fix, or `undefined` when it can. */
function problemOf(name: string, definition: FilterDefinition): string | undefined {
  if (name === "") {
    return `ERROR a filter has an empty name. Name each filter by its search parameter, such as issuer.`;
  }
  return definition.kind === "choice" || definition.kind === "multiChoice"
    ? optionsProblem(name, definition)
    : undefined;
}

/** Throws the first problem of the filters, as one ERROR line with its fix. */
function checkFilters(filters: FilterDefinitions): void {
  for (const [name, definition] of Object.entries(filters)) {
    const problem = problemOf(name, definition);
    if (problem !== undefined) {
      throw new Error(problem);
    }
  }
}

/** A page's filters, checked, with each choice's options kept as the literal values the page wrote, so the route's
 * search parameters and `FilterValues` take only those. Define them once, outside any component, and give them to
 * `filterSearchSchema` for the route and to `useFilters` for the page.
 *
 * @use For the filters of a page's table, grid or list, kept in the address. Throws one ERROR line for a choice with
 * no options, an empty option or one listed twice.
 * @see FilterBar, filterSearchSchema, useFilters, filterRows */
function defineFilters<const TFilters extends FilterDefinitions>(filters: TFilters): TFilters {
  checkFilters(filters);
  return filters;
}

export {
  checkFilters,
  chosenOf,
  defineFilters,
  isDateRangeValue,
  isNumberRangeValue,
  optionLabel,
  optionsOf,
};
export type {
  AnyFilterValue,
  ChoiceFilter,
  DateRangeFilter,
  DateRangeFilterValue,
  FilterDefinition,
  FilterDefinitions,
  FilterOption,
  FilterValue,
  FilterValues,
  MultiChoiceFilter,
  NumberRangeFilter,
  NumberRangeFilterValue,
  Option,
  TextFilter,
};
