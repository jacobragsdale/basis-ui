/**
 * Paints a chart's draw model on a Canvas 2D context. Every decision about what
 * goes where is in the model; this only draws it, with the theme's tokens for
 * the surface, gridlines and text.
 */

import type { Theme } from "../theme";
import { handles } from "./drawings";
import type { Point, Shape } from "./drawings";
import { plotBottom } from "./model";
import { fitText, wrapText } from "./text";
import type { ChartModel, Mark, Pane, Rect, ValueAxis } from "./model";

/** The data end of a bar or column is rounded; its baseline stays square. */
const RADIUS = 4;

/** The surface gap between touching slices, as between bars. */
const SLICE_GAP = 2;

/** How faint the bars and slices of groups other than the selected one are. */
const DIM = 0.3;

/** A colour's relative luminance, from `rgb()`, `rgba()`, `#rrggbb` or `color(srgb …)`; null if it is none of those. */
export function luminance(color: string): number | null {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color);
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(color);
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(color);
  const channels =
    hex !== null
      ? [hex[1], hex[2], hex[3]].map((h) => Number.parseInt(h ?? "0", 16) / 255)
      : rgb !== null
        ? [rgb[1], rgb[2], rgb[3]].map((c) => Number(c) / 255)
        : srgb !== null
          ? [srgb[1], srgb[2], srgb[3]].map(Number)
          : null;
  if (channels === null) {
    return null;
  }
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** Near-black text, whose luminance `inkOn` compares with white's. */
const DARK_INK = "#111827";
const DARK_INK_LUMINANCE = 0.0092;

/** White or near-black, whichever has the higher contrast with `color`; white if `color` can't be read. */
export function inkOn(color: string): string {
  const l = luminance(color);
  return l === null || 1.05 / (l + 0.05) >= (l + 0.05) / (DARK_INK_LUMINANCE + 0.05) ? "#ffffff" : DARK_INK;
}

export { fitText, wrapText } from "./text";

type Side = "top" | "bottom" | "left" | "right" | "none";

function corners(side: Side, r: number): [number, number, number, number] {
  switch (side) {
    case "top":
      return [r, r, 0, 0];
    case "bottom":
      return [0, 0, r, r];
    case "right":
      return [0, r, r, 0];
    case "left":
      return [r, 0, 0, r];
    case "none":
      return [0, 0, 0, 0];
  }
}

/** The height of a line of axis text, in pixels. */
const LINE_HEIGHT = 15;

/** Draws one model on one context. */
class Painter {
  /** Axis labels and data labels: the theme's small size. */
  private readonly small: string;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly theme: Theme
  ) {
    this.small = `${theme.fontSizeSmall} ${theme.fontFamily}`;
  }

  private rect(rect: Rect, side: Side): void {
    const r = Math.max(0, Math.min(RADIUS, rect.w / 2, rect.h / 2));
    this.ctx.beginPath();
    this.ctx.roundRect(rect.x, rect.y, rect.w, rect.h, corners(side, r));
    this.ctx.fill();
  }

  /** The wash under an area line, the series colour at 10 %, never a saturated block. */
  private area(segment: Float64Array, baseline: number, color: string): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(segment[0] ?? 0, baseline);
    for (let i = 0; i < segment.length; i += 2) {
      ctx.lineTo(segment[i] ?? 0, segment[i + 1] ?? 0);
    }
    ctx.lineTo(segment[segment.length - 2] ?? 0, baseline);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private stroke(segment: Float64Array, color: string, width = 2): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(segment[0] ?? 0, segment[1] ?? 0);
    for (let i = 2; i < segment.length; i += 2) {
      ctx.lineTo(segment[i] ?? 0, segment[i + 1] ?? 0);
    }
    if (segment.length === 2) {
      // A lone point between gaps is drawn as a dot.
      ctx.arc(segment[0] ?? 0, segment[1] ?? 0, 2, 0, 2 * Math.PI);
    }
    ctx.stroke();
  }

  private line(mark: Extract<Mark, { kind: "line" }>): void {
    this.ctx.setLineDash(mark.dashed ? [4, 3] : []);
    for (const segment of mark.segments) {
      if (mark.baseline !== null && segment.length >= 4) {
        this.area(segment, mark.baseline, mark.color);
      }
      if (segment.length >= 2) {
        this.stroke(segment, mark.color, mark.width);
      }
    }
    this.ctx.setLineDash([]);
  }

  /** The wash between two lines: along the upper one and back along the lower one. */
  private band(mark: Extract<Mark, { kind: "band" }>): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = mark.color;
    ctx.beginPath();
    for (let i = 0; i < mark.upper.length; i += 2) {
      ctx.lineTo(mark.upper[i] ?? 0, mark.upper[i + 1] ?? 0);
    }
    for (let i = mark.lower.length - 2; i >= 0; i -= 2) {
      ctx.lineTo(mark.lower[i] ?? 0, mark.lower[i + 1] ?? 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private columns(mark: Extract<Mark, { kind: "columns" }>): void {
    this.ctx.fillStyle = mark.color;
    for (let i = 0; i + 3 < mark.rects.length; i += 4) {
      this.ctx.fillRect(mark.rects[i] ?? 0, mark.rects[i + 1] ?? 0, mark.rects[i + 2] ?? 0, mark.rects[i + 3] ?? 0);
    }
  }

  private candle(mark: Extract<Mark, { kind: "candle" }>): void {
    const ctx = this.ctx;
    ctx.strokeStyle = mark.color;
    ctx.fillStyle = mark.color;
    const x = Math.round(mark.x) + 0.5;
    ctx.lineWidth = mark.bars ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, mark.high);
    ctx.lineTo(x, mark.low);
    if (mark.bars) {
      // An OHLC bar: the open ticks left, the close ticks right.
      const half = Math.max(1, mark.width / 2);
      ctx.moveTo(x - half, mark.open);
      ctx.lineTo(x, mark.open);
      ctx.moveTo(x, mark.close);
      ctx.lineTo(x + half, mark.close);
      ctx.stroke();
      return;
    }
    ctx.stroke();
    const body = { x: mark.x - mark.width / 2, y: Math.min(mark.open, mark.close), w: mark.width, h: Math.max(1, Math.abs(mark.close - mark.open)) };
    if (mark.hollow) {
      ctx.fillStyle = this.theme.background;
      ctx.fillRect(body.x, body.y, body.w, body.h);
      ctx.strokeRect(body.x + 0.5, body.y + 0.5, Math.max(0, body.w - 1), Math.max(0, body.h - 1));
    } else {
      ctx.fillRect(body.x, body.y, body.w, body.h);
    }
  }

  private mark(mark: Mark): void {
    switch (mark.kind) {
      case "line":
        this.line(mark);
        return;
      case "rect":
        this.ctx.globalAlpha = mark.dim === true ? DIM : 1;
        this.ctx.fillStyle = mark.color;
        this.rect(mark.rect, mark.round);
        this.ctx.globalAlpha = 1;
        return;
      case "slice":
        this.slice(mark);
        return;
      case "cell":
        this.ctx.fillStyle = mark.color;
        this.ctx.fillRect(mark.rect.x, mark.rect.y, mark.rect.w, mark.rect.h);
        return;
      case "candle":
        this.candle(mark);
        return;
      case "band":
        this.band(mark);
        return;
      case "columns":
        this.columns(mark);
        return;
    }
  }

  /**
   * X-axis labels: centred on their ticks, skipping any that would touch the one before; broken onto lines under one
   * another; or turned 45° to hang down and to the left from their ticks, cut to the model's room.
   */
  private xLabels(model: ChartModel): void {
    const ctx = this.ctx;
    const top = plotBottom(model) + 6;
    const measure = (t: string): number => ctx.measureText(t).width;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let lastRight = Number.NEGATIVE_INFINITY;
    for (const tick of model.xTicks) {
      if (tick.rotated === true) {
        ctx.save();
        ctx.translate(tick.px, top);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        // A label near the left edge is cut shorter, so that it stays on the canvas.
        const room = Math.min(model.xLabelRoom ?? 0, (tick.px - 2) * Math.SQRT2);
        ctx.fillText(fitText(tick.label, room, measure), 0, 0);
        ctx.restore();
        continue;
      }
      const lines = tick.lines ?? [tick.label];
      const half = Math.max(...lines.map(measure)) / 2;
      if (tick.px - half < lastRight + 6 || tick.px - half < 0 || tick.px + half > model.width) {
        continue;
      }
      lines.forEach((line, i) => {
        ctx.fillText(line, tick.px, top + i * LINE_HEIGHT);
      });
      lastRight = tick.px + half;
    }
  }

  /** Vertical gridlines, where values run across. */
  private vertical(x: number, from: number, to: number): void {
    const at = Math.round(x) + 0.5;
    this.ctx.beginPath();
    this.ctx.moveTo(at, from);
    this.ctx.lineTo(at, to);
    this.ctx.stroke();
  }

  private horizontal(y: number, from: number, to: number): void {
    const at = Math.round(y) + 0.5;
    this.ctx.beginPath();
    this.ctx.moveTo(from, at);
    this.ctx.lineTo(to, at);
    this.ctx.stroke();
  }

  private axes(model: ChartModel): void {
    const ctx = this.ctx;
    const { plot } = model;
    ctx.font = this.small;
    ctx.fillStyle = this.theme.muted;
    ctx.strokeStyle = this.theme.gridline;
    ctx.lineWidth = 1;
    // Gridlines follow the left axis only, or the values across: hairlines, recessive.
    for (const tick of model.yAxes.find((a) => a.side === "left")?.ticks ?? []) {
      this.horizontal(tick.px, plot.x, plot.x + plot.w);
    }
    for (const x of model.verticalGrid ?? []) {
      this.vertical(x, plot.y, plot.y + plot.h);
    }
    ctx.textBaseline = "middle";
    for (const yAxis of model.yAxes) {
      this.labels(yAxis, plot);
    }
    ctx.textAlign = "right";
    // A label wider than its gutter is cut at its end, so that it still reads from its start.
    for (const label of model.yLabels) {
      ctx.fillText(
        fitText(label.label, plot.x - 8, (t) => ctx.measureText(t).width),
        plot.x - 6,
        label.px
      );
    }
    for (const pane of model.panes) {
      this.paneAxes(pane);
    }
    ctx.fillStyle = this.theme.muted;
    ctx.strokeStyle = this.theme.borderColor;
    ctx.textAlign = "center";
    this.xLabels(model);
    this.horizontal(plotBottom(model), plot.x, plot.x + plot.w);
  }

  private labels(yAxis: ValueAxis, plot: Rect): void {
    const ctx = this.ctx;
    ctx.textAlign = yAxis.side === "left" ? "right" : "left";
    const x = yAxis.side === "left" ? plot.x - 6 : plot.x + plot.w + 6;
    for (const tick of yAxis.ticks) {
      ctx.fillText(tick.label, x, tick.px);
    }
  }

  /** A pane's separator, gridlines, guides, value labels and title. */
  private paneAxes(pane: Pane): void {
    const ctx = this.ctx;
    const { plot } = pane;
    ctx.strokeStyle = this.theme.borderColor;
    ctx.lineWidth = 1;
    this.horizontal(plot.y - 5, 0, plot.x + plot.w);
    for (const tick of pane.axis.ticks) {
      this.horizontal(tick.px, plot.x, plot.x + plot.w);
    }
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = this.theme.muted;
    for (const guide of pane.guides) {
      this.horizontal(guide, plot.x, plot.x + plot.w);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = this.theme.muted;
    ctx.textBaseline = "middle";
    this.labels(pane.axis, plot);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(pane.title, plot.x + 4, plot.y + 2);
  }

  private clipped(rect: Rect, marks: readonly Mark[]): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y - 1, rect.w, rect.h + 2);
    ctx.clip();
    for (const mark of marks) {
      this.mark(mark);
    }
    ctx.restore();
  }

  public paint(model: ChartModel): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, model.width, model.height);
    if (model.empty !== null) {
      ctx.font = this.theme.font;
      ctx.fillStyle = this.theme.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // A narrow tile wraps the message rather than cut it.
      const lines = wrapText(model.empty, Math.max(40, model.width - 16), (t) => ctx.measureText(t).width);
      lines.forEach((line, i) => {
        ctx.fillText(line, model.width / 2, model.height / 2 + (i - (lines.length - 1) / 2) * 16);
      });
      return;
    }
    // A pie has no axes, nor a baseline under it.
    if (!model.marks.some((m) => m.kind === "slice")) {
      this.axes(model);
    }
    this.clipped(model.plot, model.marks);
    for (const pane of model.panes) {
      this.clipped(pane.plot, pane.marks);
    }
    this.dataLabels(model);
    this.events(model);
    this.centre(model);
  }

  /** Bars' values at their ends and slices' shares on them, each only where it fits. */
  private dataLabels(model: ChartModel): void {
    const ctx = this.ctx;
    ctx.font = this.small;
    for (const mark of model.marks) {
      if (mark.kind === "rect" && mark.label !== undefined) {
        ctx.globalAlpha = mark.dim === true ? DIM : 1;
        this.barLabel(model, mark, mark.label);
      } else if (mark.kind === "slice" && mark.label !== undefined) {
        ctx.globalAlpha = mark.dim ? DIM : 1;
        this.sliceLabel(mark, mark.label);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A bar's value just past its end if it is no wider than the bar's room and stays inside the plot, or else, for a
   * bar that runs across, just inside its end, in the ink that reads on the bar, if the bar is long enough.
   */
  private barLabel(model: ChartModel, mark: Extract<Mark, { kind: "rect" }>, label: { readonly text: string; readonly room: number }): void {
    const width = this.ctx.measureText(label.text).width;
    if (mark.round === "top" || mark.round === "bottom") {
      this.columnLabel(model, mark.rect, mark.round === "top", label, width);
    } else if (mark.round === "left" || mark.round === "right") {
      this.acrossLabel(model, mark, mark.round === "right", label.text, width);
    }
  }

  /** An upright bar's value over its top, or under its bottom if it is negative, if it fits. */
  private columnLabel(model: ChartModel, rect: Rect, up: boolean, label: { readonly text: string; readonly room: number }, width: number): void {
    const ctx = this.ctx;
    const { plot } = model;
    const y = up ? rect.y - 4 : rect.y + rect.h + 4;
    if (width > label.room || y - LINE_HEIGHT < plot.y - 2 || y + LINE_HEIGHT > plot.y + plot.h + 2) {
      return;
    }
    ctx.fillStyle = this.theme.foreground;
    ctx.textAlign = "center";
    ctx.textBaseline = up ? "bottom" : "top";
    ctx.fillText(label.text, rect.x + rect.w / 2, y);
  }

  /** A bar running across: its value past its end if that stays in the plot, else inside its end if it is long enough. */
  private acrossLabel(model: ChartModel, mark: Extract<Mark, { kind: "rect" }>, right: boolean, text: string, width: number): void {
    const ctx = this.ctx;
    const { rect } = mark;
    const { plot } = model;
    const outside = right ? rect.x + rect.w + 4 : rect.x - 4;
    const fitsOutside = right ? outside + width <= plot.x + plot.w : outside - width >= plot.x;
    if (rect.h < LINE_HEIGHT - 4 || (!fitsOutside && rect.w < width + 12)) {
      return;
    }
    ctx.fillStyle = fitsOutside ? this.theme.foreground : inkOn(mark.color);
    ctx.textAlign = right === fitsOutside ? "left" : "right";
    ctx.textBaseline = "middle";
    const inside = right ? rect.x + rect.w - 6 : rect.x + 6;
    ctx.fillText(text, fitsOutside ? outside : inside, rect.y + rect.h / 2);
  }

  /** A slice's share across its middle, in the ink that reads best on it, if the slice has room for it. */
  private sliceLabel(mark: Extract<Mark, { kind: "slice" }>, text: string): void {
    const ctx = this.ctx;
    const middle = (mark.start + mark.end) / 2;
    const radius = mark.inner > 0 ? (mark.inner + mark.outer) / 2 : mark.outer * 0.62;
    // The level text's box, turned into the slice's frame: how far it reaches along the radius and across it.
    const [width, height] = [ctx.measureText(text).width, LINE_HEIGHT];
    const [cos, sin] = [Math.abs(Math.cos(middle)), Math.abs(Math.sin(middle))];
    const along = width * cos + height * sin;
    const across = width * sin + height * cos;
    // Both must fit, with a margin: between the hole and the rim, and within the slice's arc at the label's radius.
    const depth = 2 * Math.min(radius - mark.inner, mark.outer - radius);
    if (along + 6 > depth || across + 6 > (mark.end - mark.start) * radius) {
      return;
    }
    ctx.fillStyle = inkOn(mark.color);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, mark.cx + Math.cos(middle) * radius, mark.cy + Math.sin(middle) * radius);
  }

  /** A slice, with a gap of the surface's colour along its edges where it meets its neighbours. */
  private slice(mark: Extract<Mark, { kind: "slice" }>): void {
    const ctx = this.ctx;
    ctx.globalAlpha = mark.dim ? DIM : 1;
    ctx.fillStyle = mark.color;
    ctx.beginPath();
    ctx.arc(mark.cx, mark.cy, mark.outer, mark.start, mark.end);
    if (mark.inner > 0) {
      ctx.arc(mark.cx, mark.cy, mark.inner, mark.end, mark.start, true);
    } else {
      ctx.lineTo(mark.cx, mark.cy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // A whole circle meets nothing.
    if (mark.end - mark.start < 2 * Math.PI - 1e-6) {
      ctx.strokeStyle = this.theme.background;
      ctx.lineWidth = SLICE_GAP;
      ctx.stroke();
    }
  }

  /** A donut's total in its hole, over a muted label, when it fits. */
  private centre(model: ChartModel): void {
    const centre = model.centre ?? null;
    const slice = model.marks.find((m): m is Extract<Mark, { kind: "slice" }> => m.kind === "slice");
    if (centre === null || slice === undefined) {
      return;
    }
    const ctx = this.ctx;
    const room = slice.inner * 1.7;
    // The value grows with the hole, from 16 pixels to 32, and steps down to the body's size if it is too wide.
    const size = Math.max(16, Math.min(32, Math.round(slice.inner * 0.3)));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${String(size)}px ${this.theme.fontFamily}`;
    if (ctx.measureText(centre.value).width > room) {
      ctx.font = this.theme.font;
    }
    if (ctx.measureText(centre.value).width > room) {
      return;
    }
    // The donut's own centre, not a slice's, which moves out under the pointer.
    const [cx, cy] = [model.plot.x + model.plot.w / 2, model.plot.y + model.plot.h / 2];
    const gap = Math.round(size * 0.35);
    ctx.fillStyle = this.theme.foreground;
    ctx.fillText(centre.value, cx, cy - gap);
    ctx.font = size > 20 ? this.theme.font : this.small;
    ctx.fillStyle = this.theme.muted;
    ctx.fillText(
      fitText(centre.label, room, (t) => ctx.measureText(t).width),
      cx,
      cy + gap + 4
    );
  }

  /** Event markers: small triangles along the bottom of the price's plot, ringed in the surface colour. */
  private events(model: ChartModel): void {
    const ctx = this.ctx;
    const { plot } = model;
    const bottom = plot.y + plot.h - 1;
    ctx.fillStyle = this.theme.foreground;
    ctx.strokeStyle = this.theme.background;
    ctx.lineWidth = 1;
    for (const e of model.events) {
      if (e.px < plot.x || e.px > plot.x + plot.w) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(e.px - 4, bottom);
      ctx.lineTo(e.px + 4, bottom);
      ctx.lineTo(e.px, bottom - 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** Drawings over the price, and which is selected. */
export interface DrawingLayer {
  readonly shapes: readonly Shape[];
  readonly selected: number | null;
}

/** Paints drawings in the price plot: in the text colour, the selected one in the selection colour with its handles. */
class DrawingPainter {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly theme: Theme
  ) {}

  private segment(a: Point, b: Point): void {
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, a.y);
    this.ctx.lineTo(b.x, b.y);
    this.ctx.stroke();
  }

  private shape(shape: Shape, color: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    switch (shape.kind) {
      case "trend":
        this.segment(shape.a, shape.b);
        return;
      case "horizontal":
        this.segment({ x: shape.left, y: shape.y }, { x: shape.right, y: shape.y });
        return;
      case "fibonacci":
        this.fibonacci(shape);
        return;
      case "rectangle":
        this.rectangle(shape.a, shape.b);
        return;
      case "note":
        this.note(shape, color);
        return;
    }
  }

  private fibonacci(shape: Extract<Shape, { kind: "fibonacci" }>): void {
    const ctx = this.ctx;
    const [left, right] = [Math.min(shape.a.x, shape.b.x), Math.max(shape.a.x, shape.b.x)];
    ctx.setLineDash([3, 3]);
    this.segment(shape.a, shape.b);
    ctx.setLineDash([]);
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    for (const level of shape.levels) {
      this.segment({ x: left, y: level.y }, { x: right, y: level.y });
      ctx.fillText(level.label, left + 2, level.y - 1);
    }
  }

  private rectangle(a: Point, b: Point): void {
    const ctx = this.ctx;
    const [x, y, w, h] = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
    ctx.globalAlpha = 0.08;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(x, y, w, h);
  }

  private note(shape: Extract<Shape, { kind: "note" }>, color: string): void {
    const ctx = this.ctx;
    const { box } = shape;
    ctx.beginPath();
    ctx.arc(shape.at.x, shape.at.y, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    ctx.fillStyle = this.theme.foreground;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(shape.text, box.x + 6, box.y + box.h / 2);
    ctx.fillStyle = color;
  }

  private handles(shape: Shape): void {
    const ctx = this.ctx;
    for (const h of handles(shape)) {
      ctx.fillStyle = this.theme.background;
      ctx.fillRect(h.x - 3.5, h.y - 3.5, 7, 7);
      ctx.strokeRect(h.x - 3.5, h.y - 3.5, 7, 7);
    }
  }

  public paint(model: ChartModel, layer: DrawingLayer): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(model.plot.x, model.plot.y, model.plot.w, model.plot.h);
    ctx.clip();
    ctx.font = this.theme.font;
    ctx.lineWidth = 1.5;
    for (const shape of layer.shapes) {
      const selected = shape.index === layer.selected;
      const color = selected ? this.theme.selectionBorder : this.theme.foreground;
      ctx.lineWidth = selected ? 2 : 1.5;
      this.shape(shape, color);
      if (selected) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        this.handles(shape);
      }
    }
    ctx.restore();
  }
}

/** Paints `model` over the whole canvas, and any drawings over its price. The context's transform must already map CSS pixels. */
export function paintChart(ctx: CanvasRenderingContext2D, model: ChartModel, theme: Theme, drawings: DrawingLayer = { shapes: [], selected: null }): void {
  new Painter(ctx, theme).paint(model);
  if (drawings.shapes.length > 0 && model.empty === null) {
    new DrawingPainter(ctx, theme).paint(model, drawings);
  }
}
