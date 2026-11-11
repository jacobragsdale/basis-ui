/* Layouts typed by a dataset's rows. `useDataset<Position>(...)` gives a dataset whose views' layouts name only the
 * columns of `Position`: a column, a group, a pin, a sort, a filter, a measure's column, weight or unit, a format, a
 * cell kind, a rule or an order naming any other is a type error where it is written, not the engine's refusal when it
 * runs. A dataset of rows of no known type takes any name, as `LayoutInput` does. */

import type { LayoutInput } from "./layout.ts";

/** Rows of no known type. */
type AnyRow = object;

/** The column names of rows of `TRow`: its string keys, or any name for rows of no known type. */
type ColumnOf<TRow> = string extends keyof TRow
  ? string
  : [Extract<keyof TRow, string>] extends [never]
    ? string
    : Extract<keyof TRow, string>;

/** An item of one of the layout's lists, as written. */
type ItemOf<TKey extends keyof LayoutInput> =
  NonNullable<LayoutInput[TKey]> extends readonly (infer TItem)[] ? TItem : never;
/** A value of one of the layout's records by column, as written. */
type ValueOf<TKey extends keyof LayoutInput> =
  NonNullable<LayoutInput[TKey]> extends Readonly<Record<string, infer TValue>> ? TValue : never;

/** A measure or a total whose column, weight and unit are columns of `TColumn`. */
type MeasureOf<TColumn extends string> = Omit<
  ItemOf<"measures">,
  "column" | "unit_column" | "weight"
> & {
  readonly column?: TColumn | null;
  readonly weight?: TColumn | null;
  readonly unit_column?: TColumn | null;
};

/** The layout's fields that name columns. */
type ColumnFields =
  | "cells"
  | "columns"
  | "filters"
  | "formats"
  | "group_by"
  | "measures"
  | "orders"
  | "pinned"
  | "rules"
  | "sort"
  | "split_by"
  | "totals";

/** A layout as written whose every column name is one of `TColumn`. */
type TypedLayout<TColumn extends string> = Omit<LayoutInput, ColumnFields> & {
  columns?: TColumn[];
  group_by?: TColumn[];
  split_by?: TColumn[];
  pinned?: TColumn[];
  sort?: (Omit<ItemOf<"sort">, "column"> & { column: TColumn })[];
  filters?: (Omit<ItemOf<"filters">, "column" | "columns"> & {
    column: TColumn;
    columns?: TColumn[];
  })[];
  measures?: MeasureOf<TColumn>[];
  totals?: MeasureOf<TColumn>[];
  formats?: Partial<Record<TColumn, ValueOf<"formats">>>;
  cells?: Partial<Record<TColumn, ValueOf<"cells">>>;
  rules?: Partial<Record<TColumn, ValueOf<"rules">>>;
  orders?: Partial<Record<TColumn, ValueOf<"orders">>>;
};

/** A layout as written for a dataset of rows of `TRow`: one naming only its columns, or any `LayoutInput` for rows of no
 * known type. */
type LayoutFor<TRow> = string extends ColumnOf<TRow> ? LayoutInput : TypedLayout<ColumnOf<TRow>>;

export type { AnyRow, ColumnOf, LayoutFor, TypedLayout };
