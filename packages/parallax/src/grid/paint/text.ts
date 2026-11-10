/* Text on a grid's canvas: widths measured once per font and kept, and a cell's text drawn within it, cut with an
 * ellipsis, or `###` for a number too wide, as Excel shows it, behind the marks of a search's matches. */

import type { Ranges } from "#grid/filters.ts";

import { fillRect } from "./canvas.ts";

/** Past this many texts in one font, the cache starts again rather than grow without bound. */
const cachedTexts = 50_000;
/** How much shorter than a row a search's mark is, so it sits inside the row. */
const markInset = 6;
const noMarks: Ranges = [];

/** Text widths, measured in the font the context was last given here, and kept by font. */
class TextWidths {
  readonly #widths = new Map<string, Map<string, number>>();
  #font = "";

  /** Sets the context's font, which `measure` then measures in. */
  public use(context: CanvasRenderingContext2D, font: string): void {
    Object.assign(context, { font });
    this.#font = font;
  }

  /** The width of `text` in the font last set. */
  public measure(context: CanvasRenderingContext2D, text: string): number {
    const widths = this.#inFont();
    const known = widths.get(text);
    if (known !== undefined) {
      return known;
    }
    const { width } = context.measureText(text);
    if (widths.size > cachedTexts) {
      widths.clear();
    }
    widths.set(text, width);
    return width;
  }

  /** Forgets every width, as when the font changes. */
  public clear(): void {
    this.#widths.clear();
  }

  #inFont(): Map<string, number> {
    const known = this.#widths.get(this.#font);
    if (known !== undefined) {
      return known;
    }
    const widths = new Map<string, number>();
    this.#widths.set(this.#font, widths);
    return widths;
  }
}

/** What text is drawn with: the context and the device pixels of one of its CSS pixels, which marks snap to, its
 * widths, a cell's padding and a row's height. */
interface Pen {
  readonly context: CanvasRenderingContext2D;
  readonly ratio: number;
  readonly widths: TextWidths;
  readonly padding: number;
  readonly rowPx: number;
}

/** A cell's text and where it goes: `y` is its middle; numbers align right and show `###` when too wide. */
interface CellText {
  readonly text: string;
  readonly x: number;
  readonly width: number;
  readonly y: number;
  readonly numeric: boolean;
  /** Ranges of the text to mark, as a search's matches, in `markColor`. */
  readonly marks?: Ranges;
  readonly markColor?: string;
}

/** Fills behind each range of the cell's marks within its first `shown` characters, drawn from its padding. */
function mark(pen: Pen, cell: CellText, shown: number): void {
  const { marks = noMarks, markColor = "", text, y } = cell;
  const { context, widths } = pen;
  const left = cell.x + pen.padding;
  const ink = context.fillStyle;
  const height = pen.rowPx - markInset;
  for (const [start, end] of marks.filter(([from]) => from < shown)) {
    const from = left + widths.measure(context, text.slice(0, start));
    const to = left + widths.measure(context, text.slice(0, Math.min(end, shown)));
    fillRect(pen, markColor, [from, y - height / 2, to - from, height]);
  }
  Object.assign(context, { fillStyle: ink });
}

/** Draws a number at the cell's right, or `###` when it does not fit; returns whether it did not. */
function rightText(pen: Pen, cell: CellText, measured: number): boolean {
  const { context, widths, padding } = pen;
  const fits = measured <= cell.width - 2 * padding;
  const shown = fits ? cell.text : "###";
  const width = fits ? measured : widths.measure(context, shown);
  context.fillText(shown, cell.x + cell.width - padding - width, cell.y);
  return !fits;
}

/** How many of a text's characters fit in `room` with an ellipsis after them. */
function fittingLength(pen: Pen, text: string, room: number): number {
  let cut = text.length;
  while (cut > 0 && pen.widths.measure(pen.context, `${text.slice(0, cut)}…`) > room) {
    cut -= 1;
  }
  return cut;
}

/**
 * Draws text within a cell, behind its marks; returns `true` if it did not fit and was cut or replaced by `###`.
 */
function clipText(pen: Pen, cell: CellText): boolean {
  const { context, widths, padding } = pen;
  const measured = widths.measure(context, cell.text);
  if (cell.numeric) {
    return rightText(pen, cell, measured);
  }
  const fits = measured <= cell.width - 2 * padding;
  const cut = fits ? cell.text.length : fittingLength(pen, cell.text, cell.width - 2 * padding);
  if (cell.marks !== undefined && cell.marks.length > 0) {
    mark(pen, cell, cut);
  }
  context.fillText(fits ? cell.text : `${cell.text.slice(0, cut)}…`, cell.x + padding, cell.y);
  return !fits;
}

export { TextWidths, clipText };
export type { CellText, Pen };
