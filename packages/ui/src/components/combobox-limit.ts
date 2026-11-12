/* How many items a combobox draws at most, and what it says when it reaches them: the cap that keeps a long list as fast
 * as a short one, since each item is a node the browser lays out and a Citrix desktop draws. A list at its cap draws
 * its first items and a line under them that says to type to narrow them; Base UI gives the matches already capped, so
 * the line cannot count the rest. */

import { createContext } from "react";

/** The items a list draws unless its root sets `limit`: enough to scroll through, few enough to draw at once. */
const listLimit = 100;

/** The cap the list's root set, which its content's notice reads; `-1` for none. */
const ListLimit = createContext<number>(listLimit);

const count = new Intl.NumberFormat("en-US");

/** What the line under a list at its cap says, or `undefined` while it draws fewer. */
function limitNotice(drawn: number, limit: number): string | undefined {
  if (limit < 0 || drawn < limit) {
    return undefined;
  }
  return `Showing the first ${count.format(limit)}. Type to narrow them.`;
}

export { limitNotice, ListLimit, listLimit };
