// Type guards and assertions that narrow what TypeScript knows.

/** For the `default` of a switch that handles every case: TypeScript fails the build when a case is added and not
 * handled, and if a value the types ruled out still arrives at run time, this throws with it. */
function assertNever(value: never, message?: string): never {
  throw new TypeError(message ?? `Unexpected value: ${JSON.stringify(value) ?? String(value)}.`);
}

/** Whether a value is neither null nor undefined, for `filter(isPresent)` to narrow an array. */
function isPresent<TValue>(value: TValue): value is NonNullable<TValue> {
  return value !== null && value !== undefined;
}

/** Throws `Error` with the message unless the condition holds, and narrows by it after: `invariant(row !== undefined,
 * "The selected row is in the table.")`. The condition is a boolean, so that 0 and "" are never mistaken for false. */
function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export { assertNever, invariant, isPresent };
