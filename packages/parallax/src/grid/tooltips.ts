/* The tooltip of a cell drawn cut short, or of a flagged cell: its full text or its note, a moment after the pointer
 * stops over it. */

import type { Hit } from "./hit.ts";
import type { GridHost } from "./host.ts";
import { cellKey } from "./paint/scene.ts";

const tooltipDelayMs = 350;
/** Where a tooltip shows, from the pointer. */
const tooltipOffset = { x: 12, y: 16 };

/** Shows a cell's tooltip after the pointer rests on it. */
class Tooltips {
  readonly #host: GridHost;
  #timer: ReturnType<typeof setTimeout> | null = null;

  public constructor(host: GridHost) {
    this.#host = host;
  }

  /** Shows the tooltip of the cell under the pointer after a moment, if it has one. */
  public schedule(hit: Hit, event: PointerEvent): void {
    this.clear();
    const text =
      hit.header || hit.row === null || hit.column === null
        ? undefined
        : this.#host.note(cellKey(hit.row, hit.column));
    if (text === undefined) {
      return;
    }
    const at = { x: event.offsetX + tooltipOffset.x, y: event.offsetY + tooltipOffset.y };
    this.#timer = setTimeout(() => {
      this.#host.dom.tooltip({ ...at, text });
    }, tooltipDelayMs);
  }

  /** Hides the tooltip, and any about to show. */
  public clear(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#host.dom.tooltip(null);
  }
}

export { Tooltips };
