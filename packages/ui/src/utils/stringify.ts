// JSON with object keys sorted, so that equal data writes equal text: for cache keys, saved views and comparing
// what a form holds with what it loaded.

/** A value with a `toJSON` method, as Dates, Temporal values and Decimals have, called as JSON calls it. */
interface Jsonable {
  readonly toJSON: (key: string) => unknown;
}

function isJsonable(value: object): value is Jsonable {
  return "toJSON" in value && typeof value.toJSON === "function";
}

/** Whether JSON leaves the value out of an object, and writes `null` for it in an array. */
function isUnwritable(value: unknown): boolean {
  return value === undefined || typeof value === "function" || typeof value === "symbol";
}

/** A JSON writer that sorts keys and refuses what JSON would lose or cannot hold. */
class Writer {
  /** The objects being written, which a cycle would come back to. */
  readonly #open = new Set<object>();

  public write(raw: unknown, key: string): string | undefined {
    const value =
      typeof raw === "object" && raw !== null && isJsonable(raw) ? raw.toJSON(key) : raw;
    if (typeof value === "bigint") {
      throw new TypeError(
        `${value.toString()}n has no JSON form: write it as a string, or as a Decimal.`,
      );
    }
    if (typeof value !== "object" || value === null) {
      return isUnwritable(value) ? undefined : JSON.stringify(value);
    }
    return this.#container(value);
  }

  #container(value: object): string {
    if (value instanceof Map || value instanceof Set) {
      throw new TypeError(
        `A ${value.constructor.name} has no JSON form: convert it first, with Object.fromEntries or [...set].`,
      );
    }
    if (this.#open.has(value)) {
      throw new TypeError("The value refers back to itself, so it has no JSON form.");
    }
    this.#open.add(value);
    const text = Array.isArray(value) ? this.#array(value) : this.#object(value);
    this.#open.delete(value);
    return text;
  }

  #array(items: readonly unknown[]): string {
    return `[${items.map((item, index) => this.write(item, String(index)) ?? "null").join(",")}]`;
  }

  #object(value: object): string {
    const written = Object.keys(value)
      .toSorted()
      .flatMap((key) => {
        const text = this.write(Reflect.get(value, key), key);
        return text === undefined ? [] : [`${JSON.stringify(key)}:${text}`];
      });
    return `{${written.join(",")}}`;
  }
}

/** JSON text with every object's keys in sorted order, so two equal values always write the same text. It writes what
 * `JSON.stringify` writes in every other way: `toJSON` is called, undefined, functions and symbols are left out of
 * objects and are `null` in arrays, and NaN and the infinities are `null`. Where `JSON.stringify` would write a Map or
 * Set as `{}`, or have nothing to write at all, it throws `TypeError`, as it does for a bigint and a cycle. */
function stableStringify(value: unknown): string {
  const text = new Writer().write(value, "");
  if (text === undefined) {
    throw new TypeError(`A value of type ${typeof value} has no JSON form.`);
  }
  return text;
}

export { stableStringify };
