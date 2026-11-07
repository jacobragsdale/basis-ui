/* A header dragged to another place: dropped among the headers it moves its column, within its zone, and dropped on
 * the group panel it groups the grid by its column. */

import { withColumnBefore, withGroupedBy } from "./edit.ts";
import { columnAt, screenX } from "./geometry.ts";
import type { Hit } from "./hit.ts";
import type { GridHost } from "./host.ts";
import type { HeaderDrag } from "./paint/scene.ts";
import type { Tooltips } from "./tooltips.ts";

/** How far a pressed header must move, in pixels, before it is dragged rather than clicked. */
const dragThreshold = 6;

/** A press on the header: what it hit, where, and the width of the column whose edge it pressed. */
interface Pressed {
  readonly hit: Hit;
  readonly x: number;
  readonly startWidth: number;
  readonly key: string;
}

/** Whether a client point is inside a box. */
function inside(box: DOMRect | undefined, event: PointerEvent): boolean {
  return (
    box !== undefined &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom &&
    event.clientX >= box.left &&
    event.clientX <= box.right
  );
}

/** Follows a dragged header and drops it. */
class HeaderDragger {
  readonly #host: GridHost;
  readonly #groupPanel: () => HTMLElement | null;
  readonly #tooltips: Tooltips;

  public constructor(
    host: GridHost,
    options: { readonly groupPanel: () => HTMLElement | null; readonly tooltips: Tooltips },
  ) {
    this.#host = host;
    this.#groupPanel = options.groupPanel;
    this.#tooltips = options.tooltips;
  }

  /**
   * Follows a pressed header that moved past the threshold: it is dragged, and drops before the column whose middle
   * the pointer is left of. Returns whether the press is a drag.
   */
  public follow(pressed: Pressed, event: PointerEvent): boolean {
    const from = this.#dragged(pressed, event);
    if (from === null) {
      return false;
    }
    const overPanel = inside(this.#groupPanel()?.getBoundingClientRect(), event);
    Object.assign(this.#host.model.interaction, {
      drag: this.#dropAt(from, event.offsetX),
      overPanel,
    });
    this.#tooltips.clear();
    this.#host.dom.cursor("grabbing");
    this.#settle();
    return true;
  }

  /** Drops the dragged header: on the group panel it groups by its column, elsewhere it moves the column. */
  public drop(): void {
    const { model } = this.#host;
    const { drag, overPanel } = model.interaction;
    Object.assign(model.interaction, { drag: null, overPanel: false });
    this.#settle();
    if (drag === null) {
      return;
    }
    const name = model.geometry.widthKey(drag.from);
    if (overPanel) {
      this.#host.change((layout) => withGroupedBy(layout, name));
    } else if (drag.before !== drag.from && drag.before !== drag.from + 1) {
      this.#move(name, drag.before);
    }
  }

  /** The data column of a pressed header that moved past the threshold, which is then dragged; null for a press that
   * is not a drag, or a header that cannot move. */
  #dragged(pressed: Pressed, event: PointerEvent): number | null {
    const { model } = this.#host;
    const from = pressed.hit.column;
    const movable =
      pressed.hit.header && !pressed.hit.funnel && from !== null && model.menuColumn(from) !== null;
    const started =
      model.interaction.drag !== null || Math.abs(event.clientX - pressed.x) >= dragThreshold;
    return movable && started ? from : null;
  }

  /** Tells React and the canvas that the drag moved. */
  #settle(): void {
    this.#host.publish();
    this.#host.redraw();
  }

  /** Where header `from` would drop with the pointer at `x`: before the column whose middle `x` is left of. */
  #dropAt(from: number, x: number): HeaderDrag {
    const { geometry, area } = this.#host.model;
    const column = Math.max(0, columnAt(geometry, x, area.scrollLeft) ?? geometry.count - 1);
    const middle = screenX(geometry, column, area.scrollLeft) + geometry.width(column) / 2;
    return { before: x < middle ? column : column + 1, from };
  }

  /** Moves column `name` to just before data column `before`, within its zone, or last. */
  #move(name: string, before: number): void {
    const { model } = this.#host;
    const target = before < model.geometry.count ? model.geometry.widthKey(before) : null;
    this.#host.change((layout) =>
      withColumnBefore(layout, model.fields, { before: target, column: name }),
    );
  }
}

export { HeaderDragger };
export type { Pressed };
