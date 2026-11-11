/* Painting a chart's axes: hairline gridlines, value labels down the sides, category labels, indicator panes'
 * separators, guides and titles, and the x axis's labels and baseline. */

import { hairline } from "#canvas/device-pixels.ts";

import { plotBottom } from "./model.ts";
import type { AxisTick, ChartModel, Pane, Rect, ValueAxis } from "./model-types.ts";
import { strokeLine, style } from "./paint-canvas.ts";
import type { Painting } from "./paint-canvas.ts";
import { fitText } from "./text.ts";

/** How far labels sit from what they label, in pixels. */
const labelGap = 6;
/** How far a gutter's labels may reach before they are cut, from the plot's left edge. */
const gutterRoom = 8;
/** A turned label's angle: an eighth of a turn, down to the left, which is a quarter of half a turn. */
const quarters = 4;
const turned = -Math.PI / quarters;
/** A turned label near the left edge is cut so that it stays on the canvas, this far from it. */
const edgeRoom = 2;
/** A pane's separator sits this far above it, and its title this far in from its corner. */
const separatorGap = 5;
const titleInsetX = 4;
const titleInsetY = 2;
/** The dashes of a pane's guides: as long as their gaps. */
const guideDash = 3;
const guideDashes = [guideDash, guideDash];

/** Vertical gridlines, where values run across: one CSS pixel wide, on whole device pixels. */
function vertical(
  { ctx, ratio }: Painting,
  x: number,
  [from, to]: readonly [number, number],
): void {
  const { at, width } = hairline(x, ratio);
  ctx.lineWidth = width;
  strokeLine(ctx, [at, from], [at, to]);
}

/** A horizontal line, such as a gridline, a separator or the baseline: one CSS pixel thick, on whole device pixels. */
function horizontal(
  { ctx, ratio }: Painting,
  y: number,
  [from, to]: readonly [number, number],
): void {
  const { at, width } = hairline(y, ratio);
  ctx.lineWidth = width;
  strokeLine(ctx, [from, at], [to, at]);
}

/** A turned label, hanging down and to the left from its tick, cut to the model's room. */
function turnedLabel(
  { ctx }: Painting,
  tick: AxisTick,
  { top, room }: { readonly top: number; readonly room: number },
): void {
  const measure = (text: string): number => ctx.measureText(text).width;
  ctx.save();
  ctx.translate(tick.px, top);
  ctx.rotate(turned);
  style(ctx, { textAlign: "right", textBaseline: "middle" });
  // A label near the left edge is cut shorter, so that it stays on the canvas.
  const fits = Math.min(room, (tick.px - edgeRoom) * Math.SQRT2);
  ctx.fillText(fitText(tick.label, fits, measure), 0, 0);
  ctx.restore();
}

/**
 * A level label on its lines, centred on its tick, or moved in from the canvas's edge, as a tenor axis's 30Y at the
 * plot's end is; skipped if it would touch the one before. Returns where its right edge now is, or `lastRight` when it
 * is skipped.
 */
function levelLabel(
  painting: Painting,
  tick: AxisTick,
  at: { readonly top: number; readonly lastRight: number; readonly width: number },
): number {
  const { ctx } = painting;
  const lines = tick.lines ?? [tick.label];
  const halfWidth = Math.max(...lines.map((line) => ctx.measureText(line).width)) / 2;
  const centre = Math.max(halfWidth, Math.min(tick.px, at.width - halfWidth));
  if (centre - halfWidth < at.lastRight + labelGap) {
    return at.lastRight;
  }
  for (const [i, line] of lines.entries()) {
    ctx.fillText(line, centre, at.top + i * painting.sizes.lineHeight);
  }
  return centre + halfWidth;
}

/**
 * X-axis labels: centred on their ticks, skipping any that would touch the one before; broken onto lines under one
 * another; or turned 45° to hang down and to the left from their ticks, cut to the model's room.
 */
function xLabels(painting: Painting, model: ChartModel): void {
  const { ctx } = painting;
  const top = plotBottom(model) + labelGap;
  style(ctx, { textAlign: "center", textBaseline: "top" });
  let lastRight = Number.NEGATIVE_INFINITY;
  for (const tick of model.xTicks) {
    if (tick.rotated === true) {
      turnedLabel(painting, tick, { room: model.xLabelRoom ?? 0, top });
    } else {
      lastRight = levelLabel(painting, tick, { lastRight, top, width: model.width });
    }
  }
}

/** A value axis's labels, beside the plot on its side. */
function labels({ ctx }: Painting, axis: ValueAxis, plot: Rect): void {
  ctx.textAlign = axis.side === "left" ? "right" : "left";
  const x = axis.side === "left" ? plot.x - labelGap : plot.x + plot.width + labelGap;
  for (const tick of axis.ticks) {
    ctx.fillText(tick.label, x, tick.px);
  }
}

/** A pane's guides, such as RSI's 30 and 70: dashed lines across it in the muted colour. */
function paneGuides(painting: Painting, pane: Pane, across: readonly [number, number]): void {
  const { ctx, theme } = painting;
  ctx.setLineDash(guideDashes);
  ctx.strokeStyle = theme.muted;
  for (const guide of pane.guides) {
    horizontal(painting, guide, across);
  }
  ctx.setLineDash([]);
}

/** A pane's separator and gridlines, in the border's colour, and its guides, dashed in the muted one. */
function paneLines(painting: Painting, pane: Pane): void {
  const { ctx, theme } = painting;
  const { plot } = pane;
  const across = [plot.x, plot.x + plot.width] as const;
  style(ctx, { strokeStyle: theme.borderColor, lineWidth: 1 });
  horizontal(painting, plot.y - separatorGap, [0, plot.x + plot.width]);
  for (const tick of pane.axis.ticks) {
    horizontal(painting, tick.px, across);
  }
  paneGuides(painting, pane, across);
}

/** A pane's separator, gridlines, guides, value labels and title. */
function paneAxes(painting: Painting, pane: Pane): void {
  const { ctx, theme } = painting;
  const { plot } = pane;
  paneLines(painting, pane);
  style(ctx, { fillStyle: theme.muted, textBaseline: "middle" });
  labels(painting, pane.axis, plot);
  style(ctx, { textAlign: "left", textBaseline: "top" });
  ctx.fillText(pane.title, plot.x + titleInsetX, plot.y + titleInsetY);
}

/** Gridlines: they follow the left axis only, or the values across, as hairlines, recessive. */
function gridlines(painting: Painting, model: ChartModel): void {
  const { plot } = model;
  for (const tick of model.yAxes.find((axis) => axis.side === "left")?.ticks ?? []) {
    horizontal(painting, tick.px, [plot.x, plot.x + plot.width]);
  }
  for (const x of model.verticalGrid ?? []) {
    vertical(painting, x, [plot.y, plot.y + plot.height]);
  }
}

/** Category labels down the left side: a label wider than its gutter is cut at its end, so that it still reads from its start. */
function sideLabels({ ctx }: Painting, model: ChartModel): void {
  const { plot } = model;
  ctx.textAlign = "right";
  for (const label of model.yLabels) {
    ctx.fillText(
      fitText(label.label, plot.x - gutterRoom, (text) => ctx.measureText(text).width),
      plot.x - labelGap,
      label.px,
    );
  }
}

/** The value axes' labels, the category labels down the side, and each pane's axis. */
function valueLabels(painting: Painting, model: ChartModel): void {
  painting.ctx.textBaseline = "middle";
  for (const axis of model.yAxes) {
    labels(painting, axis, model.plot);
  }
  sideLabels(painting, model);
  for (const pane of model.panes) {
    paneAxes(painting, pane);
  }
}

/** Every axis of a chart, its panes' included, and the x axis's baseline. */
function paintAxes(painting: Painting, model: ChartModel): void {
  const { ctx, theme } = painting;
  const { plot } = model;
  style(ctx, {
    font: painting.small,
    fillStyle: theme.muted,
    strokeStyle: theme.gridline,
    lineWidth: 1,
  });
  gridlines(painting, model);
  valueLabels(painting, model);
  style(ctx, { fillStyle: theme.muted, strokeStyle: theme.borderColor, textAlign: "center" });
  xLabels(painting, model);
  horizontal(painting, plotBottom(model), [plot.x, plot.x + plot.width]);
}

export { paintAxes };
