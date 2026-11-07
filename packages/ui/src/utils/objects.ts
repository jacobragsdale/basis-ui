// Typed versions of what `Object` offers: picking and omitting keys, mapping values, and keys, entries and
// fromEntries typed by the object rather than as strings. Signatures follow es-toolkit's (MIT) where it has them.
//
// TypeScript's object types are open: a value may carry keys its type does not name, and `keys` and `entries` return
// those too, typed as the named ones. Use them on objects whose shape the code made or a schema checked.

import { completeRecord, partialRecord } from "./record.ts";

type Entry<TObject> = [key: keyof TObject & string, value: TObject[keyof TObject & string]];

/** The object's own enumerable string keys, typed as its keys. */
function keys<TObject extends object>(value: TObject): (keyof TObject & string)[] {
  const found: (keyof TObject & string)[] = [];
  for (const key in value) {
    if (Object.hasOwn(value, key)) {
      found.push(key);
    }
  }
  return found;
}

/** The object's own enumerable string-keyed entries, typed by its keys and values. */
function entries<TObject extends object>(value: TObject): Entry<TObject>[] {
  return keys(value).map((key) => [key, value[key]]);
}

/** An object of the entries. Keys the entries do not cover are absent, so each value may be `undefined`. A key such
 * as `__proto__` is kept as data. */
function fromEntries<TKey extends PropertyKey, TValue>(
  pairs: Iterable<readonly [TKey, TValue]>,
): Partial<Record<TKey, TValue>> {
  return partialRecord(pairs);
}

/** A new object with only the listed keys the object has. */
function pick<TObject extends object, TKey extends keyof TObject>(
  value: TObject,
  picked: readonly TKey[],
): Pick<TObject, TKey> {
  const present = picked.filter((key) => Object.hasOwn(value, key));
  return completeRecord(present.map((key) => [key, value[key]]));
}

/** A new object with every own enumerable string key but the listed ones. */
function omit<TObject extends object, TKey extends keyof TObject>(
  value: TObject,
  omitted: readonly TKey[],
): Omit<TObject, TKey> {
  const dropped = new Set<PropertyKey>(omitted);
  type Kept = Exclude<keyof TObject & string, TKey>;
  const kept = entries(value).filter(
    (entry): entry is [key: Kept, value: TObject[Kept]] => !dropped.has(entry[0]),
  );
  return completeRecord(kept);
}

/** A new object with the same keys, each value replaced by what `getNewValue` returns for it. */
function mapValues<TObject extends object, TValue>(
  value: TObject,
  getNewValue: (
    current: TObject[keyof TObject & string],
    key: keyof TObject & string,
    object: TObject,
  ) => TValue,
): Record<keyof TObject & string, TValue> {
  return completeRecord(
    entries(value).map(([key, current]) => [key, getNewValue(current, key, value)]),
  );
}

export { entries, fromEntries, keys, mapValues, omit, pick };
export type { Entry };
