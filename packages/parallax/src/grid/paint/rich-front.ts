/* The rich cells drawn in place of a cell's text, or over it: a badge, a pill in its value's tone with a shape that
 * says the tone without its colour; a sparkline of the numbers in its text; and a link, its text in the accent and
 * underlined. */

import type { Tone } from "#layout/cells.ts";

import { fillRect } from "./canvas.ts";
import type { CellAt, RowAt } from "./cells.ts";
import { badgePad, inkOf, inset, shapeSize, sparkWidth, tintOf } from "./rich.ts";
import type { Look } from "./rich.ts";
import type { Pass } from "./scene.ts";

/** Numbers written in text, such as `101.2 101.5 100.9` or `1,2,3`. */
const numbers = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/giu;
/** How far below the middle of a row a link's underline sits, as a share of its height. */
const underlineAt = 0.3;

/** A tone's shape, centred at `x`, `y`: a dot for a gain, a diamond for a loss, a triangle for a warning, a square
 * for a note, and none for neutral. */
function shapeOf(tone: Tone, [x, y]: readonly [number, number]): Path2D | null {
  const half = shapeSize / 2;
  const path = new Path2D();
  const corners: Readonly<Record<Tone, readonly (readonly [number, number])[]>> = {
    info: [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ],
    negative: [
      [0, -half],
      [half, 0],
      [0, half],
      [-half, 0],
    ],
    neutral: [],
    positive: [],
    warning: [
      [0, -half],
      [half, half],
      [-half, half],
    ],
  };
  if (tone === "positive") {
    path.arc(x, y, half, 0, 2 * Math.PI);
    return path;
  }
  for (const [dx, dy] of corners[tone]) {
    path.lineTo(x + dx, y + dy);
  }
  path.closePath();
  return corners[tone].length === 0 ? null : path;
}

/** Fills a tone's shape centred at `at`, in the context's fill. */
function drawShape(
  context: CanvasRenderingContext2D,
  tone: Tone,
  at: readonly [number, number],
): void {
  const path = shapeOf(tone, at);
  if (path !== null) {
    context.fill(path, "nonzero");
  }
}

/** Fills a badge's pill in its tone's tint; returns its width. */
function pill(
  pass: Pass,
  { at, cell }: { at: RowAt; cell: CellAt },
  { text, tone }: { text: string; tone: Tone },
): number {
  const { context, metrics, pen } = pass;
  const marked = tone === "neutral" ? 0 : shapeSize + badgePad / 2;
  const height = metrics.rowPx - 2 * inset;
  const width = Math.min(
    pen.widths.measure(context, text) + 2 * badgePad + marked,
    cell.width - 2 * metrics.padding,
  );
  context.beginPath();
  context.roundRect(cell.x + metrics.padding, at.y + inset, width, height, height / 2);
  context.fillStyle = tintOf(pass.theme, tone);
  context.fill();
  return width;
}

/** Draws a badge: a pill in its value's tint, its shape and its text in its tone's ink. */
function badge(
  pass: Pass,
  place: { at: RowAt; cell: CellAt },
  label: { text: string; tone: Tone },
): void {
  const { context, metrics } = pass;
  const width = pill(pass, place, label);
  const marked = label.tone === "neutral" ? 0 : shapeSize + badgePad / 2;
  const [left, middle] = [place.cell.x + metrics.padding, place.at.y + metrics.rowPx / 2];
  context.fillStyle = inkOf(pass.theme, label.tone);
  drawShape(context, label.tone, [left + badgePad + shapeSize / 2, middle]);
  context.fillText(
    label.text,
    left + badgePad + marked,
    middle,
    Math.max(0, width - 2 * badgePad - marked),
  );
}

/** The numbers written in `text`, finite ones only. */
function numbersIn(text: string): number[] {
  return (text.match(numbers) ?? []).map(Number).filter((value) => Number.isFinite(value));
}

/** The path of a sparkline of `values` across a box. */
function sparkPath(
  values: readonly number[],
  box: { x: number; y: number; width: number; height: number },
): Path2D {
  const [low, high] = [Math.min(...values), Math.max(...values)];
  const path = new Path2D();
  for (const [index, value] of values.entries()) {
    const share = high > low ? (value - low) / (high - low) : 1 / 2;
    path.lineTo(
      box.x + (index / (values.length - 1)) * box.width,
      box.y + box.height * (1 - share),
    );
  }
  return path;
}

/** Draws a sparkline of the numbers in `text` across the cell; returns false when it holds fewer than two. */
function sparkline(pass: Pass, { at, cell }: { at: RowAt; cell: CellAt }, text: string): boolean {
  const values = numbersIn(text);
  if (values.length < 2) {
    return false;
  }
  const { context, theme, metrics } = pass;
  const box = {
    height: metrics.rowPx - 2 * inset,
    width: cell.width - 2 * metrics.padding,
    x: cell.x + metrics.padding,
    y: at.y + inset,
  };
  Object.assign(context, { lineJoin: "round", lineWidth: sparkWidth, strokeStyle: theme.accent });
  context.stroke(sparkPath(values, box));
  return true;
}

/** Underlines a link's text, as far as it shows. */
function underline(pass: Pass, { at, cell }: { at: RowAt; cell: CellAt }, text: string): void {
  const { context, theme, metrics, pen } = pass;
  const width = Math.min(pen.widths.measure(context, text), cell.width - 2 * metrics.padding);
  const y = at.y + metrics.rowPx / 2 + metrics.rowPx * underlineAt;
  fillRect(pass, theme.accent, [cell.x + metrics.padding, y, width, 1]);
}

/** Draws a rich cell's front, in place of its text for a badge and a sparkline; returns whether it took the text's
 * place. A link's text is drawn in the accent, then underlined here. */
function richFront(
  pass: Pass,
  place: { at: RowAt; cell: CellAt },
  { look, text }: { look: Look; text: string },
): boolean {
  const kind = look.kind?.kind;
  if (kind === "badge" && look.kind?.kind === "badge" && text !== "") {
    badge(pass, place, { text, tone: look.kind.values[text] ?? "neutral" });
    return true;
  }
  if (kind === "sparkline") {
    return sparkline(pass, place, text);
  }
  if (kind === "link" && text !== "") {
    underline(pass, place, text);
  }
  return false;
}

export { richFront };
