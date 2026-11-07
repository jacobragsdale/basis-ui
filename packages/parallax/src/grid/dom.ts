/* The elements around a grid's canvas that follow its geometry rather than React's renders: the spacer that gives
 * the scroll its extent, the body's height when the grid sizes itself to its rows, the shadow beside pinned columns,
 * the pointer's cursor, the tooltip of a cut cell, and the place a header menu opens from. React renders each once;
 * the grid moves them as it scrolls, without a render. */

/** The elements a grid moves. */
interface GridParts {
  readonly scroll: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly spacer: HTMLDivElement;
  readonly body: HTMLDivElement;
  readonly pinnedEdge: HTMLDivElement;
  readonly tooltip: HTMLDivElement;
  readonly menuAnchor: HTMLSpanElement;
}

/** A rectangle on the canvas, in CSS pixels. */
interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The style values the grid last wrote, by element and property, so that it writes only those that change: every write
 * makes the browser work out the page's styles again, and the grid sets them on every scroll. */
const written = new WeakMap<HTMLElement, Map<string, string>>();

/** Sets an element's style properties that changed since the grid last set them. */
function setStyle(element: HTMLElement, values: Readonly<Record<string, string>>): void {
  const known = written.get(element) ?? new Map<string, string>();
  written.set(element, known);
  for (const [name, value] of Object.entries(values)) {
    if (known.get(name) !== value) {
      known.set(name, value);
      element.style.setProperty(name, value);
    }
  }
}

function px(value: number): string {
  return `${String(value)}px`;
}

/** Moves the elements around a grid's canvas. */
class GridDom {
  readonly #parts: GridParts;
  #cursor = "default";

  public constructor(parts: GridParts) {
    this.#parts = parts;
  }

  public get parts(): GridParts {
    return this.#parts;
  }

  /** Gives the scroll its extent: the content's width and the rows' height. */
  public extent(width: number, height: number): void {
    setStyle(this.#parts.spacer, { height: px(height), width: px(width) });
  }

  /** Fixes the body's height, for a grid that sizes itself to its rows, or lets it fill its container. */
  public bodyHeight(height: number | null): void {
    setStyle(
      this.#parts.body,
      height === null ? { flex: "", height: "" } : { flex: "none", height: px(height) },
    );
  }

  /** Shows the pinned columns' shadow at their right edge while columns scroll under them, or hides it. */
  public pinnedEdge(left: number | null): void {
    const edge = this.#parts.pinnedEdge;
    if (edge.hidden !== (left === null)) {
      edge.hidden = left === null;
    }
    setStyle(edge, { left: left === null ? "" : px(left) });
  }

  /** Sets the pointer's cursor over the canvas. */
  public cursor(cursor: string): void {
    if (cursor !== this.#cursor) {
      this.#cursor = cursor;
      this.#parts.canvas.style.cursor = cursor;
    }
  }

  /** Shows a tooltip with `text` at `x`, `y` over the canvas, or hides it. */
  public tooltip(
    tip: { readonly x: number; readonly y: number; readonly text: string } | null,
  ): void {
    const { tooltip } = this.#parts;
    tooltip.hidden = tip === null;
    tooltip.textContent = tip?.text ?? "";
    Object.assign(
      tooltip.style,
      tip === null ? { left: "", top: "" } : { left: px(tip.x), top: px(tip.y) },
    );
  }

  /** Places the element a header menu opens from over the header it belongs to. */
  public menuAnchor(box: Box): void {
    Object.assign(this.#parts.menuAnchor.style, {
      height: px(box.height),
      left: px(box.left),
      top: px(box.top),
      width: px(box.width),
    });
  }
}

export { GridDom };
export type { Box, GridParts };
