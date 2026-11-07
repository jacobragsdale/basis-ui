/* What React shows of a grid, as one snapshot that stays the same object until something in it changes, for
 * `useSyncExternalStore`: a frame that only scrolls the rows changes nothing in it, so it renders nothing. */

import { keys } from "@basis/ui/utils";

import type { Viewport } from "#engine/view-types.ts";
import type { FrameData } from "#frame/frame.ts";

import type { GridModel } from "./model.ts";
import { describeCell, describeRange } from "./speech.ts";
import type { ActiveCell } from "./speech.ts";
import type { OpenMenu } from "./types.ts";

/** What React shows of a grid. */
interface GridSnapshot {
  /** The window the view opens with, once the grid knows its size and tokens; until then the view waits. */
  readonly opening: Viewport | null;
  /** The view's rows, or null before its first frame. */
  readonly totalRows: number | null;
  readonly totalColumns: number;
  /** The table load the screen shows, which an export must match. */
  readonly loadVersion: bigint | null;
  /** When the source was read, in microseconds since the epoch; 0 when the source gave no time. */
  readonly sourceAsOf: bigint | null;
  /** The totals row as text, for screen readers, which cannot read the canvas; null without totals. */
  readonly totalsText: string | null;
  readonly menu: OpenMenu | null;
  /** A short note for the status bar, such as the result of a copy or an export. */
  readonly message: string;
  /** Whether a dragged header is over the group panel. */
  readonly overPanel: boolean;
  /** The focused cell as screen readers read it, or null without a selection. */
  readonly active: ActiveCell | null;
  /** The selection's size, for screen readers, when it is more than one cell. */
  readonly announcement: string;
}

const first: GridSnapshot = {
  active: null,
  announcement: "",
  loadVersion: null,
  menu: null,
  message: "",
  opening: null,
  overPanel: false,
  sourceAsOf: null,
  totalColumns: 0,
  totalRows: null,
  totalsText: null,
};

/** Each total with its column's title, as a screen reader reads the totals row. */
function totalsText(frame: FrameData | null): string | null {
  const totals = frame?.totals ?? null;
  if (totals === null) {
    return null;
  }
  const parts = totals
    .filter((total) => total.text(0) !== "")
    .map((total) => `${total.title}: ${total.text(0)}`);
  return parts.length === 0 ? null : `Totals. ${parts.join("; ")}`;
}

/** The cell `next` describes, kept as `was` when it says the same, so the snapshot stays the same object. */
function sameCell(was: ActiveCell | null, next: ActiveCell): ActiveCell {
  return was !== null && keys(next).every((key) => was[key] === next[key]) ? was : next;
}

/** Whether two snapshots show the same. */
function same(one: GridSnapshot, other: GridSnapshot): boolean {
  return keys(one).every((key) => one[key] === other[key]);
}

/** A grid's snapshots, and who listens for them. */
class Snapshots {
  readonly #listeners = new Set<() => void>();
  #current: GridSnapshot = first;
  /** The frame the totals' text was read from. */
  #frame: FrameData | null = null;

  public get current(): GridSnapshot {
    return this.#current;
  }

  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Takes what the model now says, and the window the view would open with; the first such window stays. `id` names
   * the grid's cells for screen readers. */
  public publish(
    model: GridModel,
    { opening, id }: { readonly opening: Viewport | null; readonly id: string },
  ): void {
    const { frame } = model;
    const { selection } = model.interaction;
    const spoken = frame === this.#frame ? this.#current.totalsText : totalsText(frame);
    this.#frame = frame;
    this.#replace({
      active:
        selection === null
          ? null
          : sameCell(this.#current.active, describeCell(model, { focus: selection.focus, id })),
      announcement: describeRange(selection),
      loadVersion: frame?.loadVersion ?? null,
      menu: model.interaction.menu,
      message: this.#current.message,
      opening: this.#current.opening ?? opening,
      overPanel: model.interaction.overPanel,
      sourceAsOf: frame?.sourceAsOfMicros ?? null,
      totalColumns: model.geometry.count,
      totalRows: frame?.totalRows ?? null,
      totalsText: spoken,
    });
  }

  /** Shows a short note in the status bar. */
  public say(message: string): void {
    this.#replace({ ...this.#current, message });
  }

  #replace(next: GridSnapshot): void {
    if (same(next, this.#current)) {
      return;
    }
    this.#current = next;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export { Snapshots };
export type { GridSnapshot };
