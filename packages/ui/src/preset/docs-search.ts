/* How `vp run docs` finds an entry: by its name, exactly or ignoring case, for `vp run docs NAME`; by the words of what
 * it is for, for `vp run docs --search WORDS`; and the names closest to one it does not have, for the error that
 * suggests them. */

import type { Catalogue } from "#catalogue/format.ts";

import type { Entry } from "./docs-entry.ts";

/** An entry, or a README page, as the search sees it: its name, its kind and the words it is found by. */
interface Searchable {
  readonly name: string;
  readonly kind: Entry["kind"] | "page";
  readonly module: string;
  readonly purpose: string;
  /** Its name's words, as `DateRangePicker` holds `date`, `range` and `picker`. */
  readonly nameWords: readonly string[];
  /** The words of what it is for, when to use it, its family and its module. */
  readonly words: readonly string[];
}

/** A page of the README, as the search finds it. */
interface SearchPage {
  readonly id: string;
  readonly title: string;
}

/** Words a search ignores. */
/** The longest word that is matched only whole, and keeps a final `s`. */
const shortWord = 3;

const ignored = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/** The words of `text`, in lower case, each without a plural's `s`. */
function wordsOf(text: string): string[] {
  return text
    .replaceAll(/(?<lower>[a-z0-9])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== "" && !ignored.has(word))
    .map((word) =>
      word.length > shortWord && word.endsWith("s") && !word.endsWith("ss")
        ? word.slice(0, -1)
        : word,
    );
}

function searchable(
  item: Pick<Searchable, "kind" | "module" | "name">,
  texts: readonly (string | undefined)[],
): Searchable {
  return {
    ...item,
    nameWords: wordsOf(item.name),
    purpose: texts[0] ?? "",
    words: texts.flatMap((part) => wordsOf(part ?? "")),
  };
}

/** Everything the docs can print, as the search sees it: entries, then pages. */
function searchables(catalogue: Catalogue, pages: readonly SearchPage[]): Searchable[] {
  return [
    ...catalogue.components.map(({ family, module, name, purpose, use }) =>
      searchable({ kind: "component", module, name }, [purpose, use, family]),
    ),
    ...catalogue.functions.map(({ module, name, purpose, use }) =>
      searchable({ kind: "function", module, name }, [purpose, use]),
    ),
    ...catalogue.types.map(({ module, name, purpose }) =>
      searchable({ kind: "type", module, name }, [purpose]),
    ),
    ...catalogue.modules.map(({ name, purpose }) =>
      searchable({ kind: "module", module: name, name }, [purpose]),
    ),
    ...pages.map(({ id, title }) =>
      searchable({ kind: "page", module: id.split("/")[0] ?? "", name: id }, [title]),
    ),
  ];
}

/** How well one query word matches a word: exactly, or one starting the other, for words of four letters or more. */
function matches(query: string, word: string): boolean {
  return (
    query === word ||
    (Math.min(query.length, word.length) > shortWord &&
      (word.startsWith(query) || query.startsWith(word)))
  );
}

const weights = { name: 5, purpose: 2 };
/** What ranks a kind first when scores tie: what an app builds with before what describes it. */
const kindOrder: readonly Searchable["kind"][] = [
  "component",
  "function",
  "page",
  "module",
  "type",
];

/** An entry's score for the query's words, or 0 when one of them matches nothing it holds. */
function scoreOf(item: Searchable, query: readonly string[]): number {
  let score = 0;
  for (const word of query) {
    const inName = item.nameWords.some((part) => matches(word, part));
    const inText = item.words.filter((part) => matches(word, part)).length;
    if (!inName && inText === 0) {
      return 0;
    }
    score += (inName ? weights.name : 0) + Math.min(inText, 2) * weights.purpose;
  }
  return item.kind === "type" && item.purpose === "" ? score - 1 : score;
}

interface Found {
  readonly item: Searchable;
  readonly score: number;
}

const maxResults = 12;

/** The entries and pages that hold every word of `text`, best first. */
function search(catalogue: Catalogue, pages: readonly SearchPage[], text: string): Found[] {
  const query = wordsOf(text);
  return searchables(catalogue, pages)
    .map((item) => ({ item, score: query.length === 0 ? 0 : scoreOf(item, query) }))
    .filter(({ score }) => score > 0)
    .toSorted(
      (one, other) =>
        other.score - one.score ||
        kindOrder.indexOf(one.item.kind) - kindOrder.indexOf(other.item.kind) ||
        one.item.name.length - other.item.name.length ||
        one.item.name.localeCompare(other.item.name),
    )
    .slice(0, maxResults);
}

/** The number of single-character edits from `one` to `other`. */
function distance(one: string, other: string): number {
  let previous = Array.from({ length: other.length + 1 }, (_unused, index) => index);
  for (let row = 0; row < one.length; row += 1) {
    const current = [row + 1];
    for (let column = 0; column < other.length; column += 1) {
      const changed = one[row] === other[column] ? 0 : 1;
      current.push(
        Math.min(
          (previous[column + 1] ?? 0) + 1,
          (current[column] ?? 0) + 1,
          (previous[column] ?? 0) + changed,
        ),
      );
    }
    previous = current;
  }
  return previous.at(-1) ?? 0;
}

const maxSuggestions = 3;
/** A name may be this many characters per edit from one the docs have and still be suggested. */
const editsPerName = 3;

/** The names closest to `name`: within a few edits of it, or holding it, nearest first. */
function suggestions(catalogue: Catalogue, pages: readonly SearchPage[], name: string): string[] {
  const wanted = name.toLowerCase();
  const near = Math.max(2, Math.floor(wanted.length / editsPerName));
  return [...new Set(searchables(catalogue, pages).map((item) => item.name))]
    .map((candidate) => {
      const lower = candidate.toLowerCase();
      const edits = distance(wanted, lower);
      return {
        candidate,
        rank: lower.includes(wanted) || wanted.includes(lower) ? Math.min(edits, near) : edits,
      };
    })
    .filter(({ rank }) => rank <= near)
    .toSorted(
      (one, other) => one.rank - other.rank || one.candidate.length - other.candidate.length,
    )
    .slice(0, maxSuggestions)
    .map(({ candidate }) => candidate);
}

/** The first entry whose name `same` accepts: a component, a function, a type, then a module. */
function entryMatching(
  catalogue: Catalogue,
  same: (candidate: string) => boolean,
): Entry | undefined {
  const component = catalogue.components.find((entry) => same(entry.name));
  const fn = catalogue.functions.find((entry) => same(entry.name));
  const type = catalogue.types.find((entry) => same(entry.name));
  const module = catalogue.modules.find(
    (entry) => same(entry.name) || same(entry.name.replace(/^@basis\/ui\//u, "")),
  );
  return (
    (component && { entry: component, kind: "component" }) ??
    (fn && { entry: fn, kind: "function" }) ??
    (type && { entry: type, kind: "type" }) ??
    (module && { entry: module, kind: "module" })
  );
}

/** The entry named `name`: exactly, then ignoring case. A module is named in full, or `@basis/ui`'s by its subpath alone,
 * as `dates`. */
function entryNamed(catalogue: Catalogue, name: string): Entry | undefined {
  const exact = (candidate: string): boolean => candidate === name;
  const loose = (candidate: string): boolean => candidate.toLowerCase() === name.toLowerCase();
  for (const same of [exact, loose]) {
    const found = entryMatching(catalogue, same);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export { distance, entryNamed, search, suggestions };
export type { Found, SearchPage };
