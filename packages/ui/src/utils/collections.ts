// The collection helpers modern JavaScript lacks, with es-toolkit's (MIT) names and signatures, so that what agents
// know of lodash carries over. What the language has is not repeated here: grouping is `Object.groupBy` and
// `Map.groupBy`, cloning `structuredClone`, flattening `Array.prototype.flat`, and set operations the Set methods.

import { partialRecord } from "./record.ts";

/** A callback over an array, given the item, its index and the array, as the array methods give them. */
type Visit<TItem, TResult> = (item: TItem, index: number, items: readonly TItem[]) => TResult;

/** An object of the items by the key each one gives; a later item with the same key replaces an earlier one. Keys
 * no item gives are absent, so each value may be `undefined`. */
function keyBy<TItem, TKey extends PropertyKey>(
  items: readonly TItem[],
  getKeyFromItem: Visit<TItem, TKey>,
): Partial<Record<TKey, TItem>> {
  return partialRecord(
    items.map((item, index): [TKey, TItem] => [getKeyFromItem(item, index, items), item]),
  );
}

/** How many items give each key. Keys no item gives are absent, not zero. */
function countBy<TItem, TKey extends PropertyKey>(
  items: readonly TItem[],
  mapper: Visit<TItem, TKey>,
): Partial<Record<TKey, number>> {
  const counts = new Map<TKey, number>();
  for (const [index, item] of items.entries()) {
    const key = mapper(item, index, items);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return partialRecord(counts);
}

/** The items that pass, then the items that fail, each in order. A type guard narrows both halves. */
function partition<TItem, TPassed extends TItem>(
  items: readonly TItem[],
  isInTruthy: (item: TItem, index: number, items: readonly TItem[]) => item is TPassed,
): [truthy: TPassed[], falsy: Exclude<TItem, TPassed>[]];
function partition<TItem>(
  items: readonly TItem[],
  isInTruthy: Visit<TItem, boolean>,
): [truthy: TItem[], falsy: TItem[]];
function partition<TItem>(
  items: readonly TItem[],
  isInTruthy: Visit<TItem, boolean>,
): [truthy: TItem[], falsy: TItem[]] {
  const passed: TItem[] = [];
  const failed: TItem[] = [];
  for (const [index, item] of items.entries()) {
    (isInTruthy(item, index, items) ? passed : failed).push(item);
  }
  return [passed, failed];
}

/** The items in runs of `size`, the last run holding what is left. Throws `RangeError` unless `size` is a positive
 * integer. */
function chunk<TItem>(items: readonly TItem[], size: number): TItem[][] {
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new RangeError(`A chunk size of ${String(size)} is not a positive integer.`);
  }
  return Array.from({ length: Math.ceil(items.length / size) }, (_entry, run) =>
    items.slice(run * size, (run + 1) * size),
  );
}

/** The first item for each distinct value `mapper` gives, compared as a `Set` compares, in order. */
function uniqBy<TItem, TValue>(items: readonly TItem[], mapper: Visit<TItem, TValue>): TItem[] {
  const seen = new Set<TValue>();
  return items.filter((item, index) => {
    const value = mapper(item, index, items);
    const isNew = !seen.has(value);
    seen.add(value);
    return isNew;
  });
}

/** The item `prefer` keeps: the first of the best, skipping NaN values, or the first item when every value is NaN. */
function extreme<TItem>(
  items: readonly TItem[],
  getValue: Visit<TItem, number>,
  prefer: (candidate: number, best: number) => boolean,
): TItem | undefined {
  let best: { readonly item: TItem; readonly value: number } | undefined = undefined;
  for (const [index, item] of items.entries()) {
    const value = getValue(item, index, items);
    if (!Number.isNaN(value) && (best === undefined || prefer(value, best.value))) {
      best = { item, value };
    }
  }
  return best === undefined ? items[0] : best.item;
}

/** The item with the smallest value, the first on a tie; `undefined` only for no items. */
function minBy<TItem>(items: readonly [TItem, ...TItem[]], getValue: Visit<TItem, number>): TItem;
function minBy<TItem>(items: readonly TItem[], getValue: Visit<TItem, number>): TItem | undefined;
function minBy<TItem>(items: readonly TItem[], getValue: Visit<TItem, number>): TItem | undefined {
  return extreme(items, getValue, (candidate, best) => candidate < best);
}

/** The item with the largest value, the first on a tie; `undefined` only for no items. */
function maxBy<TItem>(items: readonly [TItem, ...TItem[]], getValue: Visit<TItem, number>): TItem;
function maxBy<TItem>(items: readonly TItem[], getValue: Visit<TItem, number>): TItem | undefined;
function maxBy<TItem>(items: readonly TItem[], getValue: Visit<TItem, number>): TItem | undefined {
  return extreme(items, getValue, (candidate, best) => candidate > best);
}

/** The numbers from `start` up to, not including, `end`, by `step`; with one argument, from 0 up to it:
 * `range(4)` is `[0, 1, 2, 3]` and `range(0, -6, -2)` is `[0, -2, -4]`. Throws `RangeError` unless `step` is a
 * nonzero integer. */
function range(startOrEnd: number, end?: number, step = 1): number[] {
  if (!Number.isSafeInteger(step) || step === 0) {
    throw new RangeError(`A range step of ${String(step)} is not a nonzero integer.`);
  }
  const [start, stop] = end === undefined ? [0, startOrEnd] : [startOrEnd, end];
  const length = Math.max(Math.ceil((stop - start) / step), 0);
  return Array.from({ length }, (_entry, index) => start + index * step);
}

/** Rows of the arrays' items, one row per index of the longest array. A shorter array gives `undefined` past its end,
 * as lodash's `zip` does, and the types say so. */
function zip<TFirst>(first: readonly TFirst[]): [TFirst][];
function zip<TFirst, TSecond>(
  first: readonly TFirst[],
  second: readonly TSecond[],
): [TFirst | undefined, TSecond | undefined][];
function zip<TFirst, TSecond, TThird>(
  first: readonly TFirst[],
  second: readonly TSecond[],
  third: readonly TThird[],
): [TFirst | undefined, TSecond | undefined, TThird | undefined][];
function zip<TItem>(...arrays: readonly (readonly TItem[])[]): (TItem | undefined)[][];
function zip(...arrays: readonly (readonly unknown[])[]): unknown[][] {
  const length = Math.max(0, ...arrays.map((array) => array.length));
  return Array.from({ length }, (_entry, row) => arrays.map((array) => array[row]));
}

export { chunk, countBy, keyBy, maxBy, minBy, partition, range, uniqBy, zip };
export type { Visit };
