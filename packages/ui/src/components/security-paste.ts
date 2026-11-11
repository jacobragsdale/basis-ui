/* A list of identifiers pasted into a SecurityPicker that chooses several: each read as a CUSIP, an ISIN or a SEDOL
 * and checked, each that reads searched for, and the first security each search finds added, with a line for each
 * identifier that does not read or finds nothing. A paste of one identifier is typed as usual. */

import { parseSecurityIdentifier } from "#securities/security-identifier.ts";
import type {
  SecurityIdentifier,
  SecurityIdentifierKind,
} from "#securities/security-identifier.ts";

/** The most identifiers one paste looks up, so a sheet pasted by mistake does not send thousands of searches. */
const pasteLimit = 200;

/** The identifiers in pasted text: its words, split at spaces, new lines, commas, semicolons and tabs. */
function identifiersIn(text: string): readonly string[] {
  return text.split(/[\s,;]+/u).filter((word) => word !== "");
}

/** What a paste found: the securities to add, each once, and a line for each identifier that adds none. */
interface PasteResult<TItem> {
  readonly found: readonly TItem[];
  readonly problems: readonly string[];
}

interface PasteLookup<TItem> {
  readonly words: readonly string[];
  readonly kinds: readonly SecurityIdentifierKind[];
  readonly search: (
    identifier: SecurityIdentifier,
    signal: AbortSignal,
  ) => Promise<readonly TItem[]>;
  readonly itemKey: (item: TItem) => string;
  readonly signal: AbortSignal;
}

/** One word's security, or why it adds none. */
async function lookUp<TItem>(
  word: string,
  { kinds, search, signal }: Pick<PasteLookup<TItem>, "kinds" | "search" | "signal">,
): Promise<{ readonly item: TItem } | { readonly problem: string }> {
  const reading = parseSecurityIdentifier(word, kinds);
  if (!reading.ok) {
    return { problem: reading.reason };
  }
  const [item] = await search(reading.value, signal);
  return item === undefined ? { problem: `${word} matched no security.` } : { item };
}

/** Looks up each pasted word, at most `pasteLimit`, and gathers the securities found, each once, in the order pasted. */
async function lookUpPasted<TItem>({
  words,
  itemKey,
  ...lookup
}: PasteLookup<TItem>): Promise<PasteResult<TItem>> {
  const looked = await Promise.all(
    words.slice(0, pasteLimit).map(async (word) => lookUp(word, lookup)),
  );
  const seen = new Set<string>();
  const found = looked.flatMap((result) => {
    if (!("item" in result) || seen.has(itemKey(result.item))) {
      return [];
    }
    seen.add(itemKey(result.item));
    return [result.item];
  });
  const over =
    words.length > pasteLimit ? [`Only the first ${String(pasteLimit)} were looked up.`] : [];
  return {
    found,
    problems: [
      ...looked.flatMap((result) => ("problem" in result ? [result.problem] : [])),
      ...over,
    ],
  };
}

/** What the status line says of a paste: how many it added, and why the rest added none. */
function pasteSummary(added: number, { problems }: Pick<PasteResult<unknown>, "problems">): string {
  const count = `Added ${String(added)} ${added === 1 ? "security" : "securities"}.`;
  return problems.length === 0 ? count : `${count} ${problems.join(" ")}`;
}

export { identifiersIn, lookUpPasted, pasteLimit, pasteSummary };
export type { PasteResult };
