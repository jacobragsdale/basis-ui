/* The Zod schema of a page's filters in its search parameters, which its route's `validateSearch` takes, so TanStack
 * Router types them for `useSearch`, `Link` and `navigate`. A value the address holds that the filter cannot take, from
 * a link written by hand or a saved view older than the page's options, is dropped rather than failing the page: the
 * filter shows no choice, and the rest of the view stands. */

import { z } from "zod";

import { checkFilters, optionsOf } from "./filter-definitions.ts";
import type {
  ChoiceFilter,
  FilterDefinition,
  FilterDefinitions,
  FilterValue,
  FilterValues,
  MultiChoiceFilter,
} from "./filter-definitions.ts";

/** One filter's search parameter: absent, or a value the filter takes, any other value read as absent. */
type FilterParameter<TValue> = z.ZodCatch<z.ZodOptional<z.ZodType<TValue, TValue>>>;

/** The schema of a page's filters: an object of one optional parameter a filter. */
type FilterSearchSchema<TFilters extends FilterDefinitions> = z.ZodObject<{
  readonly [TName in keyof TFilters]: FilterParameter<FilterValue<TFilters[TName]>>;
}>;

/** An ISO 8601 date, such as `2026-11-09`. */
const isoDate = z.iso.date();

/** One of the options' values. */
function optionSchema(definition: ChoiceFilter | MultiChoiceFilter): z.ZodType<string> {
  const values = new Set(optionsOf(definition).map((option) => option.value));
  return z.string().refine((value) => values.has(value));
}

const dateRangeSchema = z
  .object({ end: isoDate, start: isoDate })
  .refine(({ start, end }) => start <= end);

const numberRangeSchema = z
  .object({ max: z.number().optional(), min: z.number().optional() })
  .refine(({ min, max }) => min !== undefined || max !== undefined)
  .refine(({ min, max }) => min === undefined || max === undefined || min <= max);

/** The value one filter takes, of its kind, never empty. */
function valueSchema(definition: FilterDefinition): z.ZodType {
  switch (definition.kind) {
    case "text": {
      return z.string().min(1);
    }
    case "choice": {
      return optionSchema(definition);
    }
    case "multiChoice": {
      return z.array(optionSchema(definition)).min(1);
    }
    case "dateRange": {
      return dateRangeSchema;
    }
    case "numberRange": {
      return numberRangeSchema;
    }
    default: {
      return z.never();
    }
  }
}

/** The schemas already made, by the filters they were made for, so a page's hook makes its schema once. */
const made = new WeakMap<FilterDefinitions, z.ZodObject>();

/** The schema of the filters, made once and kept for them. */
function madeFor(filters: FilterDefinitions): z.ZodObject {
  checkFilters(filters);
  const shape = Object.fromEntries(
    Object.entries(filters).map(([name, definition]) => [
      name,
      // Zod reads the value `catch` is given in place of one it cannot take: here, none.
      // oxlint-disable-next-line unicorn/no-useless-undefined -- `undefined` is the value Zod reads in place of a bad one, not a missing argument.
      valueSchema(definition).optional().catch(undefined),
    ]),
  );
  const schema = z.object(shape);
  made.set(filters, schema);
  return schema;
}

/** The Zod schema of the filters as search parameters, for the route's `validateSearch`, so the router types them. Each
 * parameter is optional, and a value the filter cannot take is read as absent. Extend it with the route's other
 * parameters: `filterSearchSchema(tradeFilters).extend({ selected: z.string().optional() })`. Throws one ERROR line
 * for filters `defineFilters` would refuse.
 *
 * @use For the route of a page with a FilterBar, as its `validateSearch`. Its output type is the page's
 * `FilterValues`.
 * @see defineFilters, useFilters, FilterBar */
function filterSearchSchema<const TFilters extends FilterDefinitions>(
  filters: TFilters,
): FilterSearchSchema<TFilters> {
  const schema = made.get(filters) ?? madeFor(filters);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- each parameter's schema is the one `valueSchema` makes for its filter's kind, which `FilterValue` names; TypeScript cannot follow the kinds through `Object.entries`.
  return schema as unknown as FilterSearchSchema<TFilters>;
}

/** The active filters a page's search parameters, or a saved view, hold: each value the filter can take, and no
 * other, with no key for a filter that is not active. */
function readFilterValues<TFilters extends FilterDefinitions>(
  filters: TFilters,
  search: unknown,
): FilterValues<TFilters> {
  const schema = made.get(filters) ?? madeFor(filters);
  const read: Readonly<Record<string, unknown>> = schema.parse(search ?? {});
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema's output is `FilterValues`, key by key, as `filterSearchSchema` says.
  return Object.fromEntries(
    Object.entries(read).filter(([, value]) => value !== undefined),
  ) as FilterValues<TFilters>;
}

export { filterSearchSchema, readFilterValues };
export type { FilterSearchSchema };
