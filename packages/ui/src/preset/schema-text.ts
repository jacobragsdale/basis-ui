/* Text that a schema's `pattern` matches, as `AAAAAAAAAAAA` for `^[A-Z0-9]{12}$`: each part of the pattern taken at
 * its fewest repeats, a class by its first character, or its last when `last` is set, so a second value differs from
 * the first. It reads the patterns APIs write, classes, escapes, groups, alternatives and counts; the text is tested
 * against the pattern after, and a pattern it cannot read gives `undefined`. */

/** The characters `\d`, `\w` and `\s` stand for, first and last. */
const escapes: ReadonlyMap<string, readonly [string, string]> = new Map([
  ["d", ["0", "9"]],
  ["s", [" ", " "]],
  ["w", ["a", "z"]],
]);

/** A pattern being read, and whether each choice takes its last option. */
interface Reading {
  readonly source: string;
  readonly last: boolean;
}

interface Atom {
  readonly text: string;
  /** Where the pattern goes on after the atom. */
  readonly next: number;
}

/** The character `\` and `escaped` stand for. */
function escapedText(escaped: string, last: boolean): string {
  return escapes.get(escaped)?.[last ? 1 : 0] ?? escaped;
}

/** The index of the `]` that closes the class opened at `start`. */
function classEnd(source: string, start: number): number {
  let at = start + 1;
  while (at < source.length && source[at] !== "]") {
    at += source[at] === "\\" ? 2 : 1;
  }
  return at;
}

/** The index of the `)` that closes the group opened at `start`. */
function groupEnd(source: string, start: number): number {
  let depth = 0;
  let at = start;
  for (; at < source.length; at += source[at] === "\\" ? 2 : 1) {
    depth += source[at] === "(" ? 1 : 0;
    depth -= source[at] === ")" ? 1 : 0;
    if (depth === 0) {
      return at;
    }
  }
  return at;
}

/** The index just after the part that starts at `at`: a class, a group, an escape or one character. */
function partEnd(source: string, at: number): number {
  switch (source[at] ?? "") {
    case "[": {
      return classEnd(source, at) + 1;
    }
    case "(": {
      return groupEnd(source, at) + 1;
    }
    case "\\": {
      return at + 2;
    }
    default: {
      return at + 1;
    }
  }
}

/** A character of a class, its first or last: a range's start or end, an escape's character, or itself. */
function fromClass(body: string, last: boolean): string {
  if (body.startsWith("^")) {
    return "x";
  }
  const items = [...body.matchAll(/\\(?<escaped>.)|(?<from>.)-(?<to>.)|(?<single>.)/gu)].map(
    ({ groups = {} }) => {
      const { escaped, from, to, single } = groups;
      return escaped === undefined
        ? ((last ? to : from) ?? single ?? "")
        : escapedText(escaped, last);
    },
  );
  return (last ? items.at(-1) : items[0]) ?? "";
}

/** The fewest times the count at `at` repeats its atom, and where the pattern goes on after it. */
function countAt(source: string, at: number): { readonly times: number; readonly next: number } {
  const counted = /^\{(?<fewest>\d+)(?:,\d*)?\}\??/u.exec(source.slice(at));
  if (counted !== null) {
    return { next: at + counted[0].length, times: Number(counted.groups?.["fewest"]) };
  }
  const char = source[at];
  if (char === "+" || char === "*" || char === "?") {
    const lazy = source[at + 1] === "?" ? 1 : 0;
    return { next: at + 1 + lazy, times: char === "+" ? 1 : 0 };
  }
  return { next: at, times: 1 };
}

/** The first of the top-level alternatives of `source`, to the first `|` outside a group or class. */
function firstAlternative(source: string): string {
  let at = 0;
  while (at < source.length && source[at] !== "|") {
    at = partEnd(source, at);
  }
  return source.slice(0, at);
}

/** The text of the part at `at` of `reading` that is not a group, and where the pattern goes on after it. */
function atomAt({ source, last }: Reading, at: number): Atom {
  const char = source[at] ?? "";
  const next = partEnd(source, at);
  switch (char) {
    case "[": {
      return { next, text: fromClass(source.slice(at + 1, next - 1), last) };
    }
    case "\\": {
      return { next, text: escapedText(source[at + 1] ?? "", last) };
    }
    case "^":
    case "$": {
      return { next, text: "" };
    }
    default: {
      return { next, text: char === "." ? "a" : char };
    }
  }
}

/** The text of the first alternative of `reading`, each group's its own first alternative's. */
function sequence({ source, last }: Reading): string {
  const first = firstAlternative(source);
  let text = "";
  for (let at = 0; at < first.length;) {
    const end = partEnd(first, at);
    const inner = first.slice(at + 1, end - 1).replace(/^\?(?:[!:=]|<[!=]?\w*>?)/u, "");
    const atom =
      first[at] === "("
        ? { next: end, text: sequence({ last, source: inner }) }
        : atomAt({ last, source: first }, at);
    const count = countAt(first, atom.next);
    text += atom.text.repeat(count.times);
    at = count.next;
  }
  return text;
}

/** Text `pattern` matches, or `undefined` when this cannot make one. */
function textMatching(pattern: string, last = false): string | undefined {
  try {
    const text = sequence({ last, source: pattern });
    return new RegExp(pattern, "u").test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

export { textMatching };
