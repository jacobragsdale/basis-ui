/* What the data page's tests share: a search the test answers by hand, the text of a table's column, and the compact
 * density. */

import type { Locator } from "vite-plus/test/browser";

/** One call of a search the test answers. */
interface SearchCall<TItem> {
  readonly text: string;
  readonly signal: AbortSignal;
  readonly answer: (items: readonly TItem[]) => void;
}

/** A search that records each call and waits for the test to answer it. */
function heldSearch<TItem>(): {
  readonly calls: SearchCall<TItem>[];
  readonly search: (text: string, signal: AbortSignal) => Promise<readonly TItem[]>;
} {
  const calls: SearchCall<TItem>[] = [];
  return {
    calls,
    search: async (text, signal) => {
      const { promise, resolve } = Promise.withResolvers<readonly TItem[]>();
      calls.push({ answer: resolve, signal, text });
      return promise;
    },
  };
}

/** The text of each body cell in a table's column, counting from 0, in the order the rows show. */
function columnText(table: Locator, column: number): string[] {
  return [...table.element().querySelectorAll("tbody tr")].map(
    (row) => row.querySelectorAll("td")[column]?.textContent ?? "",
  );
}

/** Runs `check` with the page in the compact density, then puts the comfortable density back. */
async function inCompactDensity(check: () => Promise<void>): Promise<void> {
  document.documentElement.dataset["density"] = "compact";
  try {
    await check();
  } finally {
    document.documentElement.dataset["density"] = "comfortable";
  }
}

export { columnText, heldSearch, inCompactDensity };
export type { SearchCall };
