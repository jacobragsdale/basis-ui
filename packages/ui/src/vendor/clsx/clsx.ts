/**
 * @license clsx 2.1.1, MIT. Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com). The license is in
 * src/vendor/clsx/LICENSE, beside this file.
 *
 * Copied from the npm package clsx@2.1.1 (dist/clsx.mjs and clsx.d.mts; source at https://github.com/lukeed/clsx)
 * and rewritten in strict TypeScript to pass @basis/ui's lint. It behaves as the original does: strings and numbers
 * are kept, arrays are read in order and nested, a dictionary gives each key whose value is truthy, inherited
 * enumerable keys included, and every other value (falsy, boolean, bigint or function) is skipped. Only cva uses it;
 * the components merge their classes with `cn`.
 */

/** A dictionary of class names, each kept when its value is truthy. */
type ClassDictionary = Readonly<Record<string, unknown>>;
/** A list of class values, read in order. */
type ClassArray = readonly ClassValue[];
/** Anything clsx accepts. */
type ClassValue =
  | ClassArray
  | ClassDictionary
  | string
  | number
  | bigint
  | null
  | boolean
  | undefined;

/** Whether clsx keeps a dictionary's key: whether its value is truthy. */
function keeps(dictionary: object, name: string): boolean {
  return Boolean(Reflect.get(dictionary, name));
}

/** The keys of a dictionary that clsx keeps, in `for...in` order. Each is added after a space once the names so far
 * are not empty, so an empty key adds a space only after another name, as in clsx. */
function keysOf(dictionary: object): string {
  let names = "";
  for (const name in dictionary) {
    if (keeps(dictionary, name)) {
      names = names === "" ? name : `${names} ${name}`;
    }
  }
  return names;
}

/** One value's class names, which is clsx's `toVal`: the empty string for anything it skips. */
function namesOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value !== "object" || value === null) {
    return "";
  }
  if (!Array.isArray(value)) {
    return keysOf(value);
  }
  const items: readonly unknown[] = value;
  return items
    .filter(Boolean)
    .map((item) => namesOf(item))
    .filter((names) => names !== "")
    .join(" ");
}

/** Joins class names, skipping the falsy ones: `clsx("a", { b: true, c: false }, ["d"])` is `"a b d"`. */
function clsx(...inputs: readonly ClassValue[]): string {
  return namesOf(inputs);
}

export { clsx };
export type { ClassArray, ClassDictionary, ClassValue };
