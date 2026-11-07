// Objects built from entries, for the helpers that return records.

/** An object of the entries, each defined as an own property, so that a key such as `__proto__` is data rather than
 * the object's prototype. A later entry replaces an earlier one with the same key. Keys the entries lack are absent,
 * which the `Partial` says. */
function partialRecord<TKey extends PropertyKey, TValue>(
  pairs: Iterable<readonly [TKey, TValue]>,
): Partial<Record<TKey, TValue>> {
  const record: Partial<Record<TKey, TValue>> = {};
  for (const [key, value] of pairs) {
    Object.defineProperty(record, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }
  return record;
}

/** An object of entries typed as `TRecord`'s keys and values, which the caller gives for every one of its keys. */
function completeRecord<TRecord extends object>(
  pairs: Iterable<readonly [keyof TRecord, TRecord[keyof TRecord]]>,
): TRecord {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the entries are TRecord's, and only the claim that they cover every key is unchecked: pick, omit and mapValues build their mapped types key by key, which TypeScript cannot follow through a loop.
  return partialRecord(pairs) as TRecord;
}

export { completeRecord, partialRecord };
