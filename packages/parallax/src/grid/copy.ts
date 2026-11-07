/* Copying a grid's selection: tab-separated text with every digit, which pastes into Excel as cells. Rows the frame
 * on screen does not hold are fetched first; a browser lets a page write to the clipboard only during the user's
 * action, so where it cannot wait for them, they are kept for the next Ctrl+C. */

import type { Viewport } from "#engine/view-types.ts";
import type { FrameData } from "#frame/frame.ts";

import type { GridHost } from "./host.ts";
import { groupText } from "./paint/scene.ts";
import { rangeOf, toTsv } from "./selection.ts";
import type { CellRange } from "./selection.ts";

/** Text ready for the clipboard, and the configuration, load and range it was made from. */
interface Prepared {
  readonly key: string;
  readonly text: string;
}

function describe(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/** A cell's text as it copies: the group column's label and count, or the data column's exact text. */
function cellCopy(
  frame: FrameData,
  { local, column }: { readonly local: number; readonly column: number },
): string {
  if (column === -1) {
    return frame.tree === null ? "" : groupText(frame.tree, local);
  }
  return frame.columns[column - frame.firstColumn]?.copy(local) ?? "";
}

/** Whether the frame holds every cell of a range. */
function holds(frame: FrameData, range: CellRange): boolean {
  const firstData = Math.max(0, range.left);
  const holdsRows = range.top >= frame.firstRow && range.bottom < frame.firstRow + frame.rowCount;
  const holdsColumns =
    range.right < 0 ||
    (firstData >= frame.firstColumn && range.right < frame.firstColumn + frame.columns.length);
  return holdsRows && holdsColumns && !(range.left === -1 && frame.tree === null);
}

/** A row of a range as its cells' text. */
function rowCopy(frame: FrameData, range: CellRange, row: number): string[] {
  const cells: string[] = [];
  for (let column = range.left; column <= range.right; column += 1) {
    cells.push(cellCopy(frame, { column, local: row - frame.firstRow }));
  }
  return cells;
}

/** The selected cells as text, if the frame holds all of them. */
function rangeText(frame: FrameData, range: CellRange): string | null {
  if (!holds(frame, range)) {
    return null;
  }
  const rows: string[][] = [];
  for (let row = range.top; row <= range.bottom; row += 1) {
    rows.push(rowCopy(frame, range, row));
  }
  return toTsv(rows);
}

/** Writes rows on their way to the clipboard. Started inside the copy event, the write still counts as the user's
 * action; the text follows when the rows arrive. */
async function write(fetched: Promise<Prepared>): Promise<void> {
  const blob = fetched.then((copy) => new Blob([copy.text], { type: "text/plain" }));
  await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
}

/** How many rows a range holds, as the status bar says it. */
function countOf(range: CellRange): string {
  const rows = range.bottom - range.top + 1;
  return `${rows.toLocaleString("en-US")} ${rows === 1 ? "row" : "rows"}`;
}

/** Identifies a copied range in one configuration and load of the view. */
function copyKey(frame: FrameData, range: CellRange): string {
  return JSON.stringify([frame.configVersion.toString(), frame.loadVersion.toString(), range]);
}

/** The window that holds a range. */
function windowOf(range: CellRange): Viewport {
  const firstColumn = Math.max(0, range.left);
  return {
    columnCount: Math.max(1, range.right - firstColumn + 1),
    firstColumn,
    firstRow: range.top,
    rowCount: range.bottom - range.top + 1,
  };
}

/** Copies a grid's selection. */
class Copier {
  readonly #host: GridHost;
  /** Rows fetched for a copy that could not reach the clipboard at once, kept for the next Ctrl+C. */
  #prepared: Prepared | null = null;

  public constructor(host: GridHost) {
    this.#host = host;
  }

  public readonly copy = (event: ClipboardEvent): void => {
    const {
      frame,
      interaction: { selection },
    } = this.#host.model;
    if (selection === null || frame === null) {
      return;
    }
    event.preventDefault();
    const range = rangeOf(selection);
    const ready = this.#ready(frame, range);
    if (ready === null) {
      this.#fetchAndCopy(range).catch(reportError);
    } else {
      event.clipboardData?.setData("text/plain", ready);
      this.#copied(range);
    }
  };

  /** Says a range reached the clipboard, which needs nothing kept for it. */
  #copied(range: CellRange): void {
    this.#prepared = null;
    this.#host.say(`Copied ${countOf(range)}`);
  }

  /** The text of a range the frame holds, or that a copy fetched for this layout and load. */
  #ready(frame: FrameData, range: CellRange): string | null {
    const prepared = this.#prepared;
    return prepared?.key === copyKey(frame, range) ? prepared.text : rangeText(frame, range);
  }

  /** Fetches the rows of a range the frame does not hold, and writes them to the clipboard, or keeps them. */
  async #fetchAndCopy(range: CellRange): Promise<void> {
    const count = countOf(range);
    this.#host.say(`Copying ${count}…`);
    const fetched = this.#fetch(range);
    if (!globalThis.isSecureContext || typeof ClipboardItem === "undefined") {
      await this.#keep(fetched, count);
      return;
    }
    try {
      await write(fetched);
      this.#host.say(`Copied ${count}`);
    } catch {
      await this.#keep(fetched, count);
    }
  }

  async #fetch(range: CellRange): Promise<Prepared> {
    const handle = this.#host.handle();
    if (handle === null) {
      throw new Error("the view is not open yet");
    }
    const frame = await handle.fetch(windowOf(range));
    const text = rangeText(frame, range);
    if (text === null) {
      throw new Error("the rows changed while copying; copy again");
    }
    return { key: copyKey(frame, range), text };
  }

  /** Keeps rows that arrived after the user's action ended, for the next Ctrl+C. */
  async #keep(fetched: Promise<Prepared>, count: string): Promise<void> {
    try {
      this.#prepared = await fetched;
      this.#host.say(`${count} ready: press Ctrl+C again to copy them`);
    } catch (error: unknown) {
      this.#host.say(`Copy failed: ${describe(error)}`);
    }
  }
}

export { Copier };
