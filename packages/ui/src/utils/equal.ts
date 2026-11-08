// Structural equality for the values a UI holds: plain objects, arrays, Maps, Sets, Dates and Temporal
// values. Any other object, such as a class instance, is equal only to itself.

/** A kind of object, and when two of it are equal. */
interface Kind<TValue> {
  readonly is: (value: unknown) => value is TValue;
  readonly equals: (left: TValue, right: TValue) => boolean;
}

const durationFields = [
  "years",
  "months",
  "weeks",
  "days",
  "hours",
  "minutes",
  "seconds",
  "milliseconds",
  "microseconds",
  "nanoseconds",
] as const satisfies readonly (keyof Temporal.Duration)[];

/** `Object.is`, but with 0 equal to -0, as `===` and `Set` have it. */
function sameValueZero(left: unknown, right: unknown): boolean {
  return left === right || (Number.isNaN(left) && Number.isNaN(right));
}

const dates: Kind<Date> = {
  equals: (left, right) => sameValueZero(left.getTime(), right.getTime()),
  is: (value): value is Date => value instanceof Date,
};
/** Durations are equal field by field, so `PT1H` and `PT60M` differ, as their fields do. */
const durations: Kind<Temporal.Duration> = {
  equals: (left, right) => durationFields.every((field) => left[field] === right[field]),
  is: (value): value is Temporal.Duration => value instanceof Temporal.Duration,
};
const instants: Kind<Temporal.Instant> = {
  equals: (left, right) => left.equals(right),
  is: (value): value is Temporal.Instant => value instanceof Temporal.Instant,
};
/** Zoned times are equal when the instant, the zone and the calendar are. */
const zonedTimes: Kind<Temporal.ZonedDateTime> = {
  equals: (left, right) => left.equals(right),
  is: (value): value is Temporal.ZonedDateTime => value instanceof Temporal.ZonedDateTime,
};
const plainDates: Kind<Temporal.PlainDate> = {
  equals: (left, right) => left.equals(right),
  is: (value): value is Temporal.PlainDate => value instanceof Temporal.PlainDate,
};
const plainDateTimes: Kind<Temporal.PlainDateTime> = {
  equals: (left, right) => left.equals(right),
  is: (value): value is Temporal.PlainDateTime => value instanceof Temporal.PlainDateTime,
};
const plainTimes: Kind<Temporal.PlainTime> = {
  equals: (left, right) => left.equals(right),
  is: (value): value is Temporal.PlainTime => value instanceof Temporal.PlainTime,
};
const yearMonths: Kind<Temporal.PlainYearMonth> = {
  equals: (left, right) => left.equals(right),
  is: (value): value is Temporal.PlainYearMonth => value instanceof Temporal.PlainYearMonth,
};
const monthDays: Kind<Temporal.PlainMonthDay> = {
  equals: (left, right) => left.equals(right),
  is: (value): value is Temporal.PlainMonthDay => value instanceof Temporal.PlainMonthDay,
};

function equalAs<TValue>(left: object, right: object, kind: Kind<TValue>): boolean | undefined {
  return kind.is(left) && kind.is(right) ? kind.equals(left, right) : undefined;
}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** One deep comparison, which remembers the pairs of objects it has started on, so that a cycle is followed once. */
class Comparison {
  readonly #seen = new Map<object, object>();

  public equal(left: unknown, right: unknown): boolean {
    if (sameValueZero(left, right)) {
      return true;
    }
    if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
      return false;
    }
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
      return false;
    }
    if (this.#seen.get(left) === right) {
      return true;
    }
    this.#seen.set(left, right);
    return this.#objects(left, right);
  }

  /** Two objects of one prototype. */
  #objects(left: object, right: object): boolean {
    if (Array.isArray(left) && Array.isArray(right)) {
      return this.#arrays(left, right);
    }
    if (left instanceof Map && right instanceof Map) {
      return this.#maps(left, right);
    }
    if (left instanceof Set && right instanceof Set) {
      return this.#sets(left, right);
    }
    return (
      equalAs(left, right, dates) ??
      equalAs(left, right, durations) ??
      equalAs(left, right, instants) ??
      equalAs(left, right, zonedTimes) ??
      equalAs(left, right, plainDates) ??
      equalAs(left, right, plainDateTimes) ??
      equalAs(left, right, plainTimes) ??
      equalAs(left, right, yearMonths) ??
      equalAs(left, right, monthDays) ??
      (isPlainObject(left) && this.#records(left, right))
    );
  }

  #arrays(left: readonly unknown[], right: readonly unknown[]): boolean {
    return (
      left.length === right.length && left.every((item, index) => this.equal(item, right[index]))
    );
  }

  /** Keys match as a Map matches them; values are compared deeply. */
  #maps(left: ReadonlyMap<unknown, unknown>, right: ReadonlyMap<unknown, unknown>): boolean {
    return (
      left.size === right.size &&
      [...left].every(([key, value]) => right.has(key) && this.equal(value, right.get(key)))
    );
  }

  /** Each member of one is matched by a different, deeply equal member of the other. */
  #sets(left: ReadonlySet<unknown>, right: ReadonlySet<unknown>): boolean {
    if (left.size !== right.size) {
      return false;
    }
    const unmatched = [...right].filter((member) => !left.has(member));
    return [...left]
      .filter((member) => !right.has(member))
      .every((member) => {
        const match = unmatched.findIndex((candidate) => this.equal(member, candidate));
        return match !== -1 && unmatched.splice(match, 1).length === 1;
      });
  }

  /** The same own enumerable string keys, with equal values. */
  #records(left: object, right: object): boolean {
    const leftEntries = Object.entries(left);
    return (
      leftEntries.length === Object.keys(right).length &&
      leftEntries.every(
        ([key, value]) => Object.hasOwn(right, key) && this.equal(value, Reflect.get(right, key)),
      )
    );
  }
}

/** Whether two values are deeply equal. Primitives compare as `===` does, except that NaN equals NaN. Arrays, Maps,
 * Sets and plain objects compare by their contents, Dates by their time, and
 * Temporal values by their own `equals`, or field by field for Durations. Two objects of different prototypes are
 * never equal, any other object is equal only to itself, and symbol keys are not compared. Cycles are followed once. */
function deepEqual(left: unknown, right: unknown): boolean {
  return new Comparison().equal(left, right);
}

export { deepEqual };
