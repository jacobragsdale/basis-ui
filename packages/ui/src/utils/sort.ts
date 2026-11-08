// A multi-key sort, as lodash's `sortBy` and `orderBy` in one: each key sorts ascending or descending, missing
// values go last whichever way, and strings compare as people read them, so "Bond 2" comes before "Bond 10".

/** What a sort key may give. Values of different kinds sort by kind, in this order. */
type SortValue =
  | boolean
  | number
  | bigint
  | string
  | Date
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDate
  | Temporal.PlainDateTime
  | Temporal.PlainTime
  | Temporal.PlainYearMonth
  | null
  | undefined;

type SortOrder = "asc" | "desc";

/** The item's keys whose values sort. A primitive item has none: it sorts by a function of it. */
type SortKey<TItem> = [TItem] extends [object]
  ? keyof { [TKey in keyof TItem as TItem[TKey] extends SortValue ? TKey : never]: unknown }
  : never;

/** A key of the item, or a function of it. */
type SortBy<TItem> = SortKey<TItem> | ((item: TItem) => SortValue);

/** What to sort by, ascending unless it says `order: "desc"`. */
type SortCriterion<TItem> =
  | SortBy<TItem>
  | { readonly by: SortBy<TItem>; readonly order: SortOrder };

/** Strings compare by the reader's alphabet, with runs of digits compared as numbers. */
const collator = new Intl.Collator("en-US", { numeric: true });

/** A kind of value: how to recognise one, and how two of them order. */
interface Kind<TValue> {
  readonly is: (value: unknown) => value is TValue;
  readonly compare: (left: TValue, right: TValue) => number;
}

function numeric(left: number | bigint, right: number | bigint): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

const booleans: Kind<boolean> = {
  compare: (left, right) => Number(left) - Number(right),
  is: (value): value is boolean => typeof value === "boolean",
};
const numbers: Kind<number | bigint> = {
  compare: numeric,
  is: (value): value is number | bigint => typeof value === "number" || typeof value === "bigint",
};
const strings: Kind<string> = {
  compare: (left, right) => collator.compare(left, right),
  is: (value): value is string => typeof value === "string",
};
const dates: Kind<Date> = {
  compare: (left, right) => numeric(left.getTime(), right.getTime()),
  is: (value): value is Date => value instanceof Date,
};
/** Instants and zoned times order by the instant they name. */
const instants: Kind<Temporal.Instant | Temporal.ZonedDateTime> = {
  compare: (left, right) => numeric(left.epochNanoseconds, right.epochNanoseconds),
  is: (value): value is Temporal.Instant | Temporal.ZonedDateTime =>
    value instanceof Temporal.Instant || value instanceof Temporal.ZonedDateTime,
};
const plainDates: Kind<Temporal.PlainDate> = {
  compare: (left, right) => Temporal.PlainDate.compare(left, right),
  is: (value): value is Temporal.PlainDate => value instanceof Temporal.PlainDate,
};
const plainDateTimes: Kind<Temporal.PlainDateTime> = {
  compare: (left, right) => Temporal.PlainDateTime.compare(left, right),
  is: (value): value is Temporal.PlainDateTime => value instanceof Temporal.PlainDateTime,
};
const plainTimes: Kind<Temporal.PlainTime> = {
  compare: (left, right) => Temporal.PlainTime.compare(left, right),
  is: (value): value is Temporal.PlainTime => value instanceof Temporal.PlainTime,
};
const yearMonths: Kind<Temporal.PlainYearMonth> = {
  compare: (left, right) => Temporal.PlainYearMonth.compare(left, right),
  is: (value): value is Temporal.PlainYearMonth => value instanceof Temporal.PlainYearMonth,
};

const kinds: readonly { readonly is: (value: unknown) => boolean }[] = [
  booleans,
  numbers,
  strings,
  dates,
  instants,
  plainDates,
  plainDateTimes,
  plainTimes,
  yearMonths,
];

/** How two values of one kind order, or `undefined` when they are not both of it. */
function compareAs<TValue>(left: unknown, right: unknown, kind: Kind<TValue>): number | undefined {
  return kind.is(left) && kind.is(right) ? kind.compare(left, right) : undefined;
}

function rankOf(value: unknown): number {
  const rank = kinds.findIndex((kind) => kind.is(value));
  return rank === -1 ? kinds.length : rank;
}

function comparePresent(left: unknown, right: unknown): number {
  const byKind = rankOf(left) - rankOf(right);
  if (byKind !== 0) {
    return byKind;
  }
  return (
    compareAs(left, right, booleans) ??
    compareAs(left, right, numbers) ??
    compareAs(left, right, strings) ??
    compareAs(left, right, dates) ??
    compareAs(left, right, instants) ??
    compareAs(left, right, plainDates) ??
    compareAs(left, right, plainDateTimes) ??
    compareAs(left, right, plainTimes) ??
    compareAs(left, right, yearMonths) ??
    0
  );
}

/** Null, undefined, NaN and an invalid Date have no place in an order, so they go last. */
function isMissing(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isNaN(value)) ||
    (value instanceof Date && Number.isNaN(value.getTime()))
  );
}

/** How two values order, by the rules `sortBy` applies to each key: ascending unless `order` says otherwise, with
 * missing values last either way. */
function compareValues(left: unknown, right: unknown, order: SortOrder = "asc"): number {
  const leftMissing = isMissing(left);
  const rightMissing = isMissing(right);
  if (leftMissing || rightMissing) {
    return Number(leftMissing) - Number(rightMissing);
  }
  const result = comparePresent(left, right);
  return order === "asc" ? result : -result;
}

function valueOf<TItem>(item: TItem, by: SortBy<TItem>): unknown {
  if (typeof by === "function") {
    return by(item);
  }
  // Only an object item has keys to sort by, so `item` is one here.
  return typeof item === "object" && item !== null ? Reflect.get(item, by) : undefined;
}

/** A new array of the items sorted by each criterion in turn, the later ones breaking ties in the earlier, and
 * stable, so items equal on every criterion keep their order:
 *
 *   sortBy(bonds, ["sector", { by: "yield", order: "desc" }, (bond) => bond.issuer.name])
 *
 * Missing values (null, undefined, NaN and invalid Dates) go last in either order. Strings compare through
 * `Intl.Collator` with numeric ordering; Dates and Temporal values compare by value. */
function sortBy<TItem>(
  items: readonly TItem[],
  criteria: readonly SortCriterion<TItem>[],
): TItem[] {
  const keys = criteria.map((criterion) =>
    typeof criterion === "object" ? criterion : { by: criterion, order: "asc" as const },
  );
  const keyed = items.map((item) => ({ item, values: keys.map(({ by }) => valueOf(item, by)) }));
  const sorted = keyed.toSorted((left, right) => {
    for (const [index, { order }] of keys.entries()) {
      const result = compareValues(left.values[index], right.values[index], order);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  });
  return sorted.map(({ item }) => item);
}

export { compareValues, isMissing, sortBy };
export type { SortBy, SortCriterion, SortKey, SortOrder, SortValue };
