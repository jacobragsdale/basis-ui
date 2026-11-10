/* The grid's header row: each column's title with its sort mark, and for a column with a menu, its funnel and pin; the
 * group column's title; the row selection's checkbox; and where a dragged header would drop. */

import { screenX } from "#grid/geometry.ts";

import { fillRect } from "./canvas.ts";
import { columnsInView } from "./columns.ts";
import { downPath, drawIcon, pinPath, upPath } from "./icons.ts";
import type { HeaderLook, Pass, SortMark } from "./scene.ts";
import { selectHeader } from "./select.ts";
import { clipText } from "./text.ts";

/** How strongly a funnel draws on a header the pointer isn't over, so that it is there to find but not loud. */
const restingFunnel = 0.5;
/** The room around a pin and a sort mark. */
const markGap = 2;
/** The width of the line that shows where a dragged header would drop. */
const dropLine = 3;

/** A header's text and where it goes: its title, its sort mark, its left and its width. */
interface Title {
  readonly title: string;
  readonly mark: SortMark | null;
  readonly x: number;
  readonly width: number;
}

/** The state a header with a menu draws in: its menu open, under the pointer or dragged, or at rest. */
type HeaderState = "open" | "lit" | "rest";

/** The room a sort mark takes in a header: its arrow and, after a gap, its priority. */
function markWidth(pass: Pass, mark: SortMark | null): number {
  if (mark === null) {
    return 0;
  }
  const priority =
    mark.priority === null ? 0 : pass.pen.widths.measure(pass.context, String(mark.priority)) + 1;
  return pass.metrics.arrowPx + markGap + priority;
}

/** Draws a sort mark at `left`: an arrow in the accent, and the sort's priority after it when there are several. */
function sortMark(pass: Pass, mark: SortMark, left: number): void {
  const { context, metrics, theme } = pass;
  const { arrowPx } = metrics;
  const middle = metrics.headerPx / 2;
  const path = mark.descending ? downPath : upPath;
  drawIcon(context, { color: theme.accent, path, size: arrowPx, x: left, y: middle - arrowPx / 2 });
  if (mark.priority !== null) {
    const ink = context.fillStyle;
    Object.assign(context, { fillStyle: theme.accent });
    context.fillText(String(mark.priority), left + arrowPx + 1, middle);
    Object.assign(context, { fillStyle: ink });
  }
}

/** Draws a header's title, cut to leave room for its sort mark, then the mark. */
function headerText(pass: Pass, { title, mark, x, width }: Title): void {
  const room = markWidth(pass, mark);
  const y = pass.metrics.headerPx / 2;
  clipText(pass.pen, { numeric: false, text: title, width: width - room, x, y });
  if (mark !== null) {
    sortMark(pass, mark, x + width - pass.metrics.padding - room + markGap);
  }
}

/** How column `column`'s header draws: its menu open, under the pointer or dragged, or at rest. */
function headerState(pass: Pass, column: number): HeaderState {
  const { scene } = pass;
  if (column === scene.menuColumn) {
    return "open";
  }
  return column === scene.hoverHeader || column === scene.drag?.from ? "lit" : "rest";
}

/** The colour and strength of a menu's mark: the accent when filtered or open, else the header's ink. */
function markInk(pass: Pass, filtered: boolean, state: HeaderState): readonly [string, number] {
  const { theme } = pass;
  if (filtered || state === "open") {
    return [theme.accent, 1];
  }
  return state === "lit" ? [theme.headerForeground, 1] : [theme.muted, restingFunnel];
}

/** Draws a pinned column's pin before its title. */
function pin(pass: Pass, at: Title & { readonly look: HeaderLook }, top: number): void {
  const { iconPx, padding } = pass.metrics;
  if (at.look.pinned) {
    drawIcon(pass.context, {
      color: pass.theme.muted,
      path: pinPath,
      size: iconPx,
      x: at.x + padding - markGap,
      y: top,
    });
  }
}

/** Draws the header of a column with a menu: a pin mark if pinned, the title and sort mark, and the menu's mark. */
function menuHeader(pass: Pass, column: number, at: Title & { readonly look: HeaderLook }): void {
  const { context, theme, metrics } = pass;
  const indent = at.look.pinned ? metrics.iconPx + markGap : 0;
  const top = metrics.headerPx / 2 - metrics.iconPx / 2;
  pin(pass, at, top);
  Object.assign(context, { fillStyle: theme.headerForeground });
  const width = at.width - indent - metrics.funnelPx + metrics.padding;
  headerText(pass, { ...at, width, x: at.x + indent });
  const [color, alpha] = markInk(pass, at.look.filtered, headerState(pass, column));
  const icon = { alpha, color, filled: at.look.filtered, path: at.look.mark, size: metrics.iconPx };
  drawIcon(context, { ...icon, x: at.x + at.width - metrics.funnelPx, y: top });
}

/** The title of data column `column`, from the frame shown. */
function titleOf(pass: Pass, column: number): string {
  const { frame } = pass.scene;
  return (frame === null ? undefined : frame.columns[column - frame.firstColumn])?.title ?? "";
}

/** Data column `column`'s title, remembered as the title its header is drawn with. */
function titled(pass: Pass, column: number): string {
  const title = titleOf(pass, column);
  pass.titles.set(column, title);
  return title;
}

/** Draws data column `column`'s header: its title, sort mark, and for a column with a menu, its funnel and pin. */
function columnHeader(pass: Pass, column: number): void {
  const { context, theme, metrics, geometry, scene } = pass;
  const at = {
    mark: scene.sortMark(column),
    title: titled(pass, column),
    width: geometry.width(column),
    x: screenX(geometry, column, pass.scrollLeft),
  };
  if (headerState(pass, column) !== "rest") {
    fillRect(pass, theme.controlHover, [at.x, 0, at.width, metrics.headerPx]);
  }
  Object.assign(context, { fillStyle: theme.headerForeground });
  const look = scene.look(column);
  if (look === null) {
    headerText(pass, at);
  } else {
    menuHeader(pass, column, { ...at, look });
  }
  fillRect(pass, theme.columnBorder, [at.x + at.width - 1, 0, 1, metrics.headerPx]);
}

/** Draws the group column's header: the levels it groups by, and their sort. */
function treeHeader(pass: Pass): void {
  const { context, theme, metrics, geometry, scene } = pass;
  const { layout } = scene;
  Object.assign(context, { fillStyle: theme.headerForeground });
  const title =
    layout === null || layout.group_by.length === 0 ? "Group" : layout.group_by.join(" › ");
  const x = geometry.selectPx;
  headerText(pass, { mark: scene.sortMark(-1), title, width: geometry.treePx, x });
  fillRect(pass, theme.columnBorder, [x + geometry.treePx - 1, 0, 1, metrics.headerPx]);
}

/** Draws where a dragged header would drop: a line in the accent before the column it would go before. */
function dropMark(pass: Pass): void {
  const { theme, metrics, geometry, scene } = pass;
  const { drag } = scene;
  if (drag === null || geometry.count === 0) {
    return;
  }
  const at = Math.min(drag.before, geometry.count);
  const x =
    at < geometry.count
      ? screenX(geometry, at, pass.scrollLeft)
      : screenX(geometry, at - 1, pass.scrollLeft) + geometry.width(at - 1);
  fillRect(pass, theme.accent, [x - 1, 0, dropLine, metrics.headerPx]);
}

/** Draws the checkboxes' header and the group column's, but not in a strip of the scrolling columns that a scroll
 * exposed, which holds neither. */
function frozenHeaders(pass: Pass): void {
  if (pass.only?.axis !== "columns") {
    selectHeader(pass);
    if (pass.geometry.treePx > 0) {
      treeHeader(pass);
    }
  }
}

/** Draws the whole header row. */
function drawHeader(pass: Pass): void {
  const { context, theme, metrics, pen } = pass;
  fillRect(pass, theme.headerBackground, [0, 0, pass.width, metrics.headerPx]);
  pen.widths.use(context, pass.fonts.header);
  frozenHeaders(pass);
  columnsInView(pass, { height: metrics.headerPx, top: 0 }, (column) => {
    columnHeader(pass, column);
    return true;
  });
  pen.widths.use(context, pass.fonts.body);
  dropMark(pass);
  fillRect(pass, theme.headerBorder, [0, metrics.headerPx - 1, pass.width, 1]);
}

export { drawHeader, markWidth, titleOf };
