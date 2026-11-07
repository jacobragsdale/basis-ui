/* Painting what a chart writes over its marks: bars' values at their ends, slices' shares on them, a donut's total in
 * its hole, and event markers along the price's plot. Each label is written only where it fits. */

import { inkOn } from "./ink.ts";
import { lineHeight } from "./paint-axes.ts";
import { dim, style } from "./paint-canvas.ts";
import type { Painting } from "./paint-canvas.ts";
import type { ChartModel, Rect, RectMark, SliceMark } from "./model-types.ts";
import { fitText } from "./text.ts";

/** A bar's label as it is written: the bar, its value and the room it may take, and how wide the value is. */
interface BarLabel {
  readonly model: ChartModel;
  readonly mark: RectMark;
  readonly label: NonNullable<RectMark["label"]>;
  readonly width: number;
}

/** How far a bar's label sits from its end, how far inside it when it is written on the bar, and the room it leaves. */
const labelGap = 4;
const insideGap = 6;
const insideRoom = 12;
/** The room a label leaves around itself on a slice, and how far out from the centre of a pie it sits. */
const sliceRoom = 6;
const pieLabelRadius = 0.62;
/** A donut's value grows with its hole, from 16 pixels to 32, at this share of the hole's radius. */
const smallestCentre = 16;
const largestCentre = 32;
const centreShare = 0.3;
/** How wide the centre's text may be, as a share of the hole's radius. */
const centreRoom = 1.7;
/** The gap between the centre's value and its label, as a share of the value's size, and past it. */
const centreGap = 0.35;
const centreLabelGap = 4;
/** Above this size the centre's label takes the body's font, below it the small one. */
const centreBody = 20;
const centreWeight = 600;
/** An event marker's half width and height. */
const eventHalf = 4;
const eventHeight = 7;

/** An upright bar's value over its top, or under its bottom if it is negative, if it fits. */
function columnLabel({ ctx, theme }: Painting, { model, mark, label, width }: BarLabel): void {
  const { rect } = mark;
  const { plot } = model;
  const up = mark.round === "top";
  const y = up ? rect.y - labelGap : rect.y + rect.height + labelGap;
  // A label over a bar must stay below the plot's top, and one under a negative bar above its bottom.
  const inside = up ? y - lineHeight >= plot.y - 2 : y + lineHeight <= plot.y + plot.height + 2;
  if (width > label.room || !inside) {
    return;
  }
  style(ctx, {
    fillStyle: theme.foreground,
    textAlign: "center",
    textBaseline: up ? "bottom" : "top",
  });
  ctx.fillText(label.text, rect.x + rect.width / 2, y);
}

/** Where a bar running across writes its value: past its end, if that stays in the plot, or inside it. */
function acrossPlace({ model, mark, width }: BarLabel): {
  readonly fitsOutside: boolean;
  readonly x: number;
} {
  const { rect } = mark;
  const { plot } = model;
  const right = mark.round === "right";
  const outside = right ? rect.x + rect.width + labelGap : rect.x - labelGap;
  const fitsOutside = right ? outside + width <= plot.x + plot.width : outside - width >= plot.x;
  const inside = right ? rect.x + rect.width - insideGap : rect.x + insideGap;
  return { fitsOutside, x: fitsOutside ? outside : inside };
}

/** A bar running across: its value past its end if that stays in the plot, else inside its end if it is long enough. */
function acrossLabel({ ctx, theme }: Painting, bar: BarLabel): void {
  const { rect } = bar.mark;
  const right = bar.mark.round === "right";
  const { fitsOutside, x } = acrossPlace(bar);
  if (
    rect.height < lineHeight - labelGap ||
    (!fitsOutside && rect.width < bar.width + insideRoom)
  ) {
    return;
  }
  style(ctx, {
    fillStyle: fitsOutside ? theme.foreground : inkOn(bar.mark.color),
    textAlign: right === fitsOutside ? "left" : "right",
    textBaseline: "middle",
  });
  ctx.fillText(bar.label.text, x, rect.y + rect.height / 2);
}

/**
 * A bar's value just past its end if it is no wider than the bar's room and stays inside the plot, or else, for a
 * bar that runs across, just inside its end, in the ink that reads on the bar, if the bar is long enough.
 */
function barLabel(painting: Painting, model: ChartModel, mark: RectMark): void {
  const { label } = mark;
  if (label === undefined) {
    return;
  }
  const bar = { label, mark, model, width: painting.ctx.measureText(label.text).width };
  if (mark.round === "top" || mark.round === "bottom") {
    columnLabel(painting, bar);
  } else if (mark.round === "left" || mark.round === "right") {
    acrossLabel(painting, bar);
  }
}

/** The radius a slice's label sits at: the ring's middle, or out from the centre of a pie. */
function labelRadius(mark: SliceMark): number {
  return mark.inner > 0 ? (mark.inner + mark.outer) / 2 : mark.outer * pieLabelRadius;
}

/** Whether a label of `width` fits on a slice at its middle, with a margin, between the hole and the rim and within the arc. */
function fitsSlice(mark: SliceMark, width: number): boolean {
  const middle = (mark.start + mark.end) / 2;
  const radius = labelRadius(mark);
  // The level text's box, turned into the slice's frame: how far it reaches along the radius and across it.
  const height = lineHeight;
  const [cos, sin] = [Math.abs(Math.cos(middle)), Math.abs(Math.sin(middle))];
  const along = width * cos + height * sin;
  const across = width * sin + height * cos;
  const depth = 2 * Math.min(radius - mark.inner, mark.outer - radius);
  return !(along + sliceRoom > depth || across + sliceRoom > (mark.end - mark.start) * radius);
}

/** A slice's share across its middle, in the ink that reads best on it, if the slice has room for it. */
function sliceLabel({ ctx }: Painting, mark: SliceMark): void {
  const text = mark.label;
  if (text === undefined || !fitsSlice(mark, ctx.measureText(text).width)) {
    return;
  }
  const middle = (mark.start + mark.end) / 2;
  const radius = labelRadius(mark);
  style(ctx, { fillStyle: inkOn(mark.color), textAlign: "center", textBaseline: "middle" });
  ctx.fillText(text, mark.cx + Math.cos(middle) * radius, mark.cy + Math.sin(middle) * radius);
}

/** Bars' values at their ends and slices' shares on them, each only where it fits. */
function dataLabels(painting: Painting, model: ChartModel): void {
  const { ctx } = painting;
  ctx.font = painting.small;
  for (const mark of model.marks) {
    if (mark.kind === "rect" && mark.label !== undefined) {
      ctx.globalAlpha = mark.dim === true ? dim : 1;
      barLabel(painting, model, mark);
    } else if (mark.kind === "slice" && mark.label !== undefined) {
      ctx.globalAlpha = mark.dim ? dim : 1;
      sliceLabel(painting, mark);
    }
  }
  ctx.globalAlpha = 1;
}

/** The donut's own centre, not a slice's, which moves out under the pointer. */
function centreOf(plot: Rect): readonly [number, number] {
  return [plot.x + plot.width / 2, plot.y + plot.height / 2];
}

/**
 * Sets the font a donut's value is written in, which grows with the hole, from 16 pixels to 32, and steps down to the
 * body's size if it is too wide. Returns its size, or null if even the body's size is too wide.
 */
function centreFont({ ctx, theme }: Painting, value: string, inner: number): number | null {
  const room = inner * centreRoom;
  const size = Math.max(smallestCentre, Math.min(largestCentre, Math.round(inner * centreShare)));
  style(ctx, {
    textAlign: "center",
    textBaseline: "middle",
    font: `${String(centreWeight)} ${String(size)}px ${theme.fontFamily}`,
  });
  if (ctx.measureText(value).width > room) {
    ctx.font = theme.font;
  }
  return ctx.measureText(value).width > room ? null : size;
}

/** A donut's value and its label, written about its centre at `size`, the label cut to `room`. */
function writeCentre(
  painting: Painting,
  model: ChartModel,
  {
    written,
    size,
    room,
  }: {
    readonly written: { readonly value: string; readonly label: string };
    readonly size: number;
    readonly room: number;
  },
): void {
  const { ctx, theme } = painting;
  const [cx, cy] = centreOf(model.plot);
  const gap = Math.round(size * centreGap);
  ctx.fillStyle = theme.foreground;
  ctx.fillText(written.value, cx, cy - gap);
  style(ctx, { font: size > centreBody ? theme.font : painting.small, fillStyle: theme.muted });
  ctx.fillText(
    fitText(written.label, room, (text) => ctx.measureText(text).width),
    cx,
    cy + gap + centreLabelGap,
  );
}

/** A donut's total in its hole, over a muted label, when it fits. */
function centre(painting: Painting, model: ChartModel): void {
  const written = model.centre ?? null;
  const slice = model.marks.find((mark): mark is SliceMark => mark.kind === "slice");
  const size =
    written === null || slice === undefined
      ? null
      : centreFont(painting, written.value, slice.inner);
  if (written !== null && slice !== undefined && size !== null) {
    writeCentre(painting, model, { room: slice.inner * centreRoom, size, written });
  }
}

/** One event marker: a small triangle up from `bottom`, filled and ringed. */
function eventMarker(ctx: CanvasRenderingContext2D, px: number, bottom: number): void {
  ctx.beginPath();
  ctx.moveTo(px - eventHalf, bottom);
  ctx.lineTo(px + eventHalf, bottom);
  ctx.lineTo(px, bottom - eventHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Event markers: small triangles along the bottom of the price's plot, ringed in the surface colour. */
function events({ ctx, theme }: Painting, model: ChartModel): void {
  const { plot } = model;
  const bottom = plot.y + plot.height - 1;
  style(ctx, { fillStyle: theme.foreground, strokeStyle: theme.background, lineWidth: 1 });
  for (const event of model.events) {
    if (event.px >= plot.x && event.px <= plot.x + plot.width) {
      eventMarker(ctx, event.px, bottom);
    }
  }
}

/** Everything written over the marks: data labels, then event markers, then a donut's centre. */
function paintLabels(painting: Painting, model: ChartModel): void {
  dataLabels(painting, model);
  events(painting, model);
  centre(painting, model);
}

export { paintLabels };
