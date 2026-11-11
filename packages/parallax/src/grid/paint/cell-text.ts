/* A data cell's text: its colour and alignment, a search's marks, a rule's ink and weight, and a badge or a sparkline
 * in its place or a link's underline over it, with the tooltip it keeps: a flagged cell's note, or a cut cell's text. */

import { isNegativeText } from "#format.ts";
import type { CellFlag } from "#frame/cell.ts";
import type { FrameColumn } from "#frame/columns.ts";
import type { RowKind } from "#frame/tree.ts";
import { highlightRanges } from "#grid/filters.ts";
import type { Ranges } from "#grid/filters.ts";

import type { CellAt, RowAt } from "./cells.ts";
import type { Look } from "./rich.ts";
import { richFront } from "./rich-front.ts";
import type { Pass } from "./scene.ts";
import { clipText } from "./text.ts";

const flagNotes: Readonly<Record<CellFlag, string | null>> = {
  mixed: "This group combines values in different units, so they are not added.",
  ok: null,
  overflow: "The exact result needs more than 38 digits, so it is not shown.",
  undefined: "Undefined, such as a share of a zero total.",
};

const noMarks: Ranges = [];
/** What a cell shows: its text, its flag, and the kind of its row. */
interface Shown {
  readonly kind: RowKind | null;
  readonly text: string;
  readonly flag: CellFlag;
}

/** How a data cell's text draws: its colour, whether it aligns right, and the search's matches to mark. */
interface Style {
  readonly color: string;
  readonly right: boolean;
  readonly marks: Ranges;
}

/** A data cell's colour: muted when flagged, the negative colour for a negative number. */
function inkOf(pass: Pass, numeric: boolean, { text, flag }: Shown): string {
  const { theme } = pass;
  if (flag !== "ok") {
    return theme.muted;
  }
  return numeric && isNegativeText(text) ? theme.negative : theme.foreground;
}

/** How a data cell draws. A detail view's group row holds its totals, which align as numbers whatever the column
 * holds. */
function cellStyle(pass: Pass, data: FrameColumn, shown: Shown): Style {
  const numeric = data.total !== null && shown.kind === "group" ? data.totalNumeric : data.numeric;
  const searched = pass.search !== "" && !numeric && pass.searched.has(data.name);
  return {
    color: inkOf(pass, numeric, shown),
    marks: searched ? highlightRanges(shown.text, pass.search) : noMarks,
    right: numeric && shown.flag === "ok",
  };
}

/** Keeps what a cell's tooltip says, or forgets it when null. */
function noteCell(pass: Pass, key: string, note: string | null): void {
  if (note === null) {
    pass.notes.delete(key);
  } else {
    pass.notes.set(key, note);
  }
}

/** What a data cell draws: its place, its column, its key, and how its layout draws it, with the ink its fill asks. */
interface CellDraw {
  readonly cell: CellAt;
  readonly data: FrameColumn;
  readonly key: string;
  readonly look: Look | null;
  readonly ink: string | null;
}

/** Draws a cell's text in `ink`, in the group font when `bold`, at the cell's middle; returns whether it was cut. */
function inkedText(
  pass: Pass,
  { at, cell, style }: { readonly at: RowAt; readonly cell: CellAt; readonly style: Style },
  { text, ink, bold }: { readonly text: string; readonly ink: string; readonly bold: boolean },
): boolean {
  Object.assign(pass.context, { fillStyle: ink });
  const { font } = pass.pen.widths;
  if (bold) {
    pass.pen.widths.use(pass.context, pass.fonts.group);
  }
  const placed = {
    markColor: pass.theme.highlight,
    marks: style.marks,
    numeric: style.right,
    text,
    width: cell.width,
    x: cell.x,
    y: at.y + pass.metrics.rowPx / 2,
  };
  const cut = clipText(pass.pen, placed);
  pass.pen.widths.use(pass.context, font);
  return cut;
}

/** Draws a badge or a sparkline in place of a cell's text; returns whether it did. */
function inPlace(
  pass: Pass,
  at: RowAt,
  { cell, look, text }: CellDraw & { readonly text: string },
): boolean {
  return (
    look !== null && look.kind?.kind !== "link" && richFront(pass, { at, cell }, { look, text })
  );
}

/** Draws a cell's text in its style, a rule's ink and weight, or a link's accent and underline; returns whether it
 * was cut. */
function styledText(
  pass: Pass,
  at: RowAt,
  { cell, data, look, ink, shown }: CellDraw & { readonly shown: Shown },
): boolean {
  const link = look?.kind?.kind === "link";
  const style = cellStyle(pass, data, shown);
  const color = ink ?? (link ? pass.theme.accent : style.color);
  const bold = look?.rule?.bold === true;
  const cut = inkedText(pass, { at, cell, style }, { bold, ink: color, text: shown.text });
  if (link && look !== null) {
    richFront(pass, { at, cell }, { look, text: shown.text });
  }
  return cut;
}

/** Draws a data cell's text in its style, or a badge or sparkline in its place, keeping its tooltip: a flagged cell's
 * note, or a cut cell's text. A rule's bold draws the text in the group font; a link's is in the accent, underlined. */
function cellText(pass: Pass, at: RowAt, draw: CellDraw): void {
  const text = draw.data.text(at.local);
  const shown = {
    flag: draw.data.flag(at.local),
    kind: at.frame.tree?.kind(at.local) ?? null,
    text,
  };
  if (inPlace(pass, at, { ...draw, text })) {
    noteCell(pass, draw.key, flagNotes[shown.flag] ?? null);
    return;
  }
  const cut = styledText(pass, at, { ...draw, shown });
  noteCell(pass, draw.key, flagNotes[shown.flag] ?? (cut ? text : null));
}

export { cellText, noteCell };
export type { CellDraw };
