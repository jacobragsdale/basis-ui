/* The wheel on a grid's body. A mouse's notch moves the rows a whole number of rows at once, as a spreadsheet's does,
 * rather than the browser's 100 pixels animated over several frames: under smooth scrolling that is four or five rows
 * a notch, drawn and sent to a remote desktop as several whole frames. A trackpad's small pixel deltas, and the
 * horizontal wheel, stay the browser's, which scrolls them smoothly and keeps their momentum. */

import type { RowGeometry } from "./geometry.ts";

/** What the grid reads of a wheel event. `wheelDeltaY` is the legacy delta, 120 for each notch of a mouse's wheel. */
interface WheelLike {
  readonly deltaMode: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly wheelDeltaY?: number;
}

/** `WheelEvent`'s delta modes, which Node, where the unit tests run, has no `WheelEvent` to name. */
const lineMode = 1;
const pageMode = 2;
/** The legacy delta of one notch, which Chromium gives for each tick of a mouse's wheel. */
const notchDelta = 120;
/** Chromium's notch in pixels, for the platform's default lines a notch: a desktop set to scroll more lines a notch
 * gives more pixels. */
const notchPixels = 100;
const notchLines = 3;
const pixelsPerLine = notchPixels / notchLines;

/** Whether a delta in pixels is a mouse's notches, rather than a trackpad's movement: its legacy delta is a whole
 * number of notches, and it covers a line at least. A browser without the legacy delta scrolls as it would. */
function notched(event: WheelLike): boolean {
  const legacy = Math.abs(event.wheelDeltaY ?? 0);
  return legacy > 0 && legacy % notchDelta === 0 && Math.abs(event.deltaY) >= pixelsPerLine;
}

/**
 * The rows a wheel event moves the body, down for a positive count, or null when the browser should scroll it: a
 * trackpad's pixels, the horizontal wheel, Shift's sideways scroll and Ctrl's zoom. A delta in lines is a line a row,
 * as Firefox gives the platform's lines a notch; a delta in pixels is a row for each of Chromium's lines; a page is
 * `pageRows`.
 */
function wheelRows(event: WheelLike, pageRows: number): number | null {
  const { deltaMode, deltaX, deltaY } = event;
  if (event.ctrlKey || event.shiftKey || deltaY === 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
    return null;
  }
  const sign = Math.sign(deltaY);
  const size = Math.abs(deltaY);
  if (deltaMode === lineMode) {
    return sign * Math.max(1, Math.round(size));
  }
  if (deltaMode === pageMode) {
    return sign * Math.max(1, Math.round(size * pageRows));
  }
  return notched(event) ? sign * Math.max(1, Math.round(size / pixelsPerLine)) : null;
}

/** A grid's body as the wheel moves it: its scrolling element, its rows' sizes and where they sit, and how many. */
interface WheelBody {
  readonly scroll: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight">;
  readonly metrics: { readonly rowPx: number; readonly headerPx: number };
  readonly rows: RowGeometry;
  readonly totalRows: number;
}

/** The scroll offset a wheel event moves `body` to, its first row's, or null when the browser should scroll: the
 * event is not a notch's, or the rows are at the end it moves toward, where the browser scrolls the page instead. */
function wheelTop(
  event: WheelLike,
  { scroll, metrics, rows, totalRows }: WheelBody,
): number | null {
  const page = Math.max(1, Math.floor((scroll.clientHeight - metrics.headerPx) / metrics.rowPx));
  const moved = wheelRows(event, page);
  if (moved === null) {
    return null;
  }
  const first = rows.firstRow(scroll.scrollTop, scroll.clientHeight);
  const row = Math.min(Math.max(0, first + moved), Math.max(0, totalRows - 1));
  const end = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  const top = Math.min(end, rows.scrollTopFor(row, scroll.clientHeight));
  return Math.abs(top - scroll.scrollTop) < 1 ? null : top;
}

export { wheelRows, wheelTop };
export type { WheelBody, WheelLike };
