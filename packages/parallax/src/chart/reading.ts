/* What the crosshair or the pointer reads, and where its tooltip goes: the pointer over this chart, or the x another
 * chart of its group points at. */

import type { ChartFrameData } from "#frame/chart-data.ts";

import { eventRows, indicatorRows, markAt, readSeries } from "./interaction.ts";
import type { Reading } from "./interaction.ts";
import { plotBottom } from "./model.ts";
import { pixel } from "./scale.ts";
import type { ChartModel, Point } from "./model-types.ts";

/** About how wide a tooltip is, to keep it on the plot's right edge. */
const tipWidth = 200;
/** How far a tooltip sits from its crosshair or the pointer. */
const tipGap = 12;
/** How far below the plot's top a tooltip sits. */
const tipDrop = 4;

/** A reading placed on the plot: the crosshair's run and the tooltip's corner, in CSS pixels. */
interface PlacedReading extends Reading {
  readonly top: number;
  readonly height: number;
  readonly left: number;
  readonly tipTop: number;
}

/** What a reading is taken from. */
interface ReadingInput {
  readonly model: ChartModel;
  readonly frame: ChartFrameData | null;
  /** The series hidden from the plot, by their legend labels. */
  readonly hidden: readonly string[];
  /** The pointer over this chart, or null. */
  readonly hover: Point | null;
  /** The x, in axis positions, that another chart of the group points at, or null. */
  readonly synced: number | null;
}

/** The x in axis positions the pointer over this chart is at, or another chart of its group points at. */
function pointedX({ model, hover, synced }: ReadingInput): number | null {
  if (model.x === null) {
    return null;
  }
  return hover === null ? synced : model.x.invert(hover.x);
}

/** The candle or other mark at axis position `x`, at the pointer's height or the plot's middle. */
function markReading(input: ReadingInput, x: number): Reading | null {
  const { model, hover } = input;
  return model.x === null
    ? null
    : markAt(model, pixel(model.x, x), hover?.y ?? model.plot.y + model.plot.height / 2);
}

/** What the pointer over the chart reads, or another chart of its group points at; indicators and events read at the
 * crosshair too, under the price's rows. */
function readingOf(input: ReadingInput): Reading | null {
  const { model, frame, hidden, hover } = input;
  const x = pointedX(input);
  if (x === null) {
    return hover === null ? null : markAt(model, hover.x, hover.y);
  }
  const reading =
    frame?.content.kind === "series"
      ? readSeries(frame, model, { hidden, x })
      : markReading(input, x);
  return reading === null || frame === null
    ? reading
    : {
        ...reading,
        rows: [
          ...reading.rows,
          ...indicatorRows(frame, model, { hidden, x }),
          ...eventRows(frame, model, x),
        ],
      };
}

/** A reading placed beside its crosshair or the pointer, flipped near the plot's right edge. */
function placeReading(reading: Reading, model: ChartModel, hover: Point | null): PlacedReading {
  const anchor = reading.crosshair ?? hover?.x ?? 0;
  const left =
    anchor + tipGap + tipWidth > model.width
      ? Math.max(0, anchor - tipGap - tipWidth)
      : anchor + tipGap;
  return {
    ...reading,
    height: plotBottom(model) - model.plot.y,
    left,
    tipTop: model.plot.y + tipDrop,
    top: model.plot.y,
  };
}

export { placeReading, readingOf };
export type { PlacedReading, ReadingInput };
