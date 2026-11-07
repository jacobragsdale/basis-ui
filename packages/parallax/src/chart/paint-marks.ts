/* Painting a chart's marks on a Canvas 2D context: lines with their area washes, bands, columns, bars, slices, cells
 * and candles. Every decision about what goes where is in the model; this only draws it. */

import { paintCandle } from "./paint-candles.ts";
import { style } from "./paint-canvas.ts";
import type { Painting } from "./paint-canvas.ts";
import type {
  BandMark,
  CandleMark,
  CellMark,
  ColumnsMark,
  LineMark,
  Mark,
  Rect,
  RectMark,
  SliceMark,
} from "./model-types.ts";

/** The data end of a bar or column is rounded; its baseline stays square. */
const radius = 4;
/** The surface gap between touching slices, as between bars. */
const sliceGap = 2;
/** How faint the bars and slices of groups other than the selected one are. */
const dim = 0.3;
/** An area's and a band's wash: the series colour at 10 %, never a saturated block. */
const wash = 0.1;
/** The dashes of a dashed line, and the radius of a lone point between gaps. */
const dashLength = 4;
const dashGap = 3;
const dashes = [dashLength, dashGap];
const dotRadius = 2;
/** The values in a column mark's quads, x, y, width and height, and the place of the height. */
const quad = 4;
const quadHeight = 3;
/** The place of a segment's last x from its end: x and y alternate. */
const lastX = -2;
/** A turn short of whole, by this much, still meets its neighbours. */
const wholeTurn = 1e-6;

type Side = RectMark["round"];

/** The marks that fill a shape of their own. */
type BarLike = RectMark | SliceMark | CellMark | CandleMark;

function corners(side: Side, round: number): [number, number, number, number] {
  switch (side) {
    case "top": {
      return [round, round, 0, 0];
    }
    case "bottom": {
      return [0, 0, round, round];
    }
    case "right": {
      return [0, round, round, 0];
    }
    case "left": {
      return [round, 0, 0, round];
    }
    case "none": {
      return [0, 0, 0, 0];
    }
    default: {
      return side satisfies never;
    }
  }
}

function paintRect({ ctx }: Painting, rect: Rect, side: Side): void {
  const round = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, corners(side, round));
  ctx.fill();
}

/** Lines from the current point through every point of `segment`, from its `first` value on. */
function through(ctx: CanvasRenderingContext2D, segment: Float64Array, first: number): void {
  for (let i = first; i < segment.length; i += 2) {
    ctx.lineTo(segment[i] ?? 0, segment[i + 1] ?? 0);
  }
}

/** The wash under an area line, the series colour at 10 %, never a saturated block. */
function paintArea({ ctx }: Painting, segment: Float64Array, line: LineMark): void {
  const baseline = line.baseline ?? 0;
  style(ctx, { globalAlpha: wash, fillStyle: line.color });
  ctx.beginPath();
  ctx.moveTo(segment[0] ?? 0, baseline);
  through(ctx, segment, 0);
  ctx.lineTo(segment.at(lastX) ?? 0, baseline);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintStroke({ ctx }: Painting, segment: Float64Array, line: LineMark): void {
  style(ctx, {
    strokeStyle: line.color,
    lineWidth: line.width,
    lineJoin: "round",
    lineCap: "round",
  });
  ctx.beginPath();
  ctx.moveTo(segment[0] ?? 0, segment[1] ?? 0);
  through(ctx, segment, 2);
  if (segment.length === 2) {
    // A lone point between gaps is drawn as a dot.
    ctx.arc(segment[0] ?? 0, segment[1] ?? 0, dotRadius, 0, 2 * Math.PI);
  }
  ctx.stroke();
}

function paintLine(painting: Painting, mark: LineMark): void {
  painting.ctx.setLineDash(mark.dashed ? dashes : []);
  for (const segment of mark.segments) {
    if (mark.baseline !== null && segment.length >= quad) {
      paintArea(painting, segment, mark);
    }
    if (segment.length >= 2) {
      paintStroke(painting, segment, mark);
    }
  }
  painting.ctx.setLineDash([]);
}

/** The wash between two lines: along the upper one and back along the lower one. */
function paintBand({ ctx }: Painting, mark: BandMark): void {
  style(ctx, { globalAlpha: wash, fillStyle: mark.color });
  ctx.beginPath();
  through(ctx, mark.upper, 0);
  for (let i = mark.lower.length - 2; i >= 0; i -= 2) {
    ctx.lineTo(mark.lower[i] ?? 0, mark.lower[i + 1] ?? 0);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintColumns({ ctx }: Painting, mark: ColumnsMark): void {
  ctx.fillStyle = mark.color;
  for (let i = 0; i + quadHeight < mark.rects.length; i += quad) {
    ctx.fillRect(
      mark.rects[i] ?? 0,
      mark.rects[i + 1] ?? 0,
      mark.rects[i + 2] ?? 0,
      mark.rects[i + quadHeight] ?? 0,
    );
  }
}

/** A slice's ring segment as a closed path, filled in its colour, faint if another group is selected. */
function fillSlice({ ctx }: Painting, mark: SliceMark): void {
  style(ctx, { globalAlpha: mark.dim ? dim : 1, fillStyle: mark.color });
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
}

/** A slice, with a gap of the surface's colour along its edges where it meets its neighbours. */
function paintSlice(painting: Painting, mark: SliceMark): void {
  fillSlice(painting, mark);
  // A whole circle meets nothing.
  if (mark.end - mark.start < 2 * Math.PI - wholeTurn) {
    style(painting.ctx, { strokeStyle: painting.theme.background, lineWidth: sliceGap });
    painting.ctx.stroke();
  }
}

/** A heatmap's or density's cell. */
function paintCell({ ctx }: Painting, mark: CellMark): void {
  ctx.fillStyle = mark.color;
  ctx.fillRect(mark.rect.x, mark.rect.y, mark.rect.width, mark.rect.height);
}

/** A bar, faint if another group is selected. */
function paintBar(painting: Painting, mark: RectMark): void {
  style(painting.ctx, { globalAlpha: mark.dim === true ? dim : 1, fillStyle: mark.color });
  paintRect(painting, mark.rect, mark.round);
  painting.ctx.globalAlpha = 1;
}

/** A filled mark: a bar, a slice, a cell or a candle. */
function paintFilled(painting: Painting, mark: BarLike): void {
  switch (mark.kind) {
    case "rect": {
      paintBar(painting, mark);
      return;
    }
    case "slice": {
      paintSlice(painting, mark);
      return;
    }
    case "cell": {
      paintCell(painting, mark);
      return;
    }
    case "candle": {
      paintCandle(painting, mark);
      return;
    }
    default: {
      mark satisfies never;
    }
  }
}

function paintMark(painting: Painting, mark: Mark): void {
  switch (mark.kind) {
    case "line": {
      paintLine(painting, mark);
      return;
    }
    case "band": {
      paintBand(painting, mark);
      return;
    }
    case "columns": {
      paintColumns(painting, mark);
      return;
    }
    case "rect":
    case "slice":
    case "cell":
    case "candle": {
      paintFilled(painting, mark);
      return;
    }
    default: {
      mark satisfies never;
    }
  }
}

/** Marks clipped to a plot, with a pixel's room above and below for lines at its edges. */
function paintClipped(painting: Painting, rect: Rect, marks: readonly Mark[]): void {
  const { ctx } = painting;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y - 1, rect.width, rect.height + 2);
  ctx.clip();
  for (const mark of marks) {
    paintMark(painting, mark);
  }
  ctx.restore();
}

export { dim, paintClipped };
