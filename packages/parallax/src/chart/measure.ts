/* A measurement: the band dragged with the measure tool, in axis positions and prices so that it follows zooming and
 * resizing, and what the engine said changed across it. This places its band and card on a model, and words the card. */

import type { Measurement } from "#engine/view-types.ts";

import type { ChartModel, Point, Rect } from "./model-types.ts";
import { pixel } from "./scale.ts";

/** Where a measurement stands: dragged until let go, then asked of the engine until it answers. */
type MeasureState = "dragging" | "asking" | "measured" | "nothing" | "failed";

/** What a measurement's card shows: its state, the series measured and the engine's answer, and the load it is of. */
interface MeasureCard {
  readonly state: MeasureState;
  /** The series measured, by its legend label, or "" on a chart of one. */
  readonly series: string;
  readonly measurement: Measurement | null;
  /** The data load it was measured on: a newer load puts it away. */
  readonly load: bigint;
}

/** A measurement, with the band's ends as axis positions and prices. */
interface Measuring extends MeasureCard {
  readonly from: Point;
  readonly to: Point;
}

/** A measurement as drawn: its band, and its card's place, inside the plot. */
interface MeasurePlace {
  readonly band: Rect;
  readonly card: Point;
}

/** One line of a measurement's card: the value leads, the label follows. */
interface MeasureLine {
  readonly value: string;
  readonly label: string;
}

/** The card's width, for keeping it inside the plot, and how far it sits from the band. */
const cardWidth = 220;
const cardGap = 8;
/** How far above the plot's bottom the card's top stays, so that it fits. */
const cardRoom = 96;

/** What a measurement's card says, by its state. */
const stateText: Readonly<Record<Exclude<MeasureState, "measured">, string>> = {
  asking: "Measuring…",
  dragging: "",
  failed: "The measurement failed",
  nothing: "Nothing to measure here",
};

/** What a measurement's card says: the engine's answer once it has one, else what is happening. */
function measureLines(card: MeasureCard): readonly MeasureLine[] {
  const measured = card.measurement;
  if (card.state !== "measured" || measured === null) {
    const text = card.state === "measured" ? "" : stateText[card.state];
    return text === "" ? [] : [{ label: "", value: text }];
  }
  const percent = measured.percent === "" ? "" : ` (${measured.percent})`;
  return [
    ...(card.series === "" ? [] : [{ label: "", value: card.series }]),
    { label: "change", value: `${measured.change}${percent}` },
    { label: measured.rows === 1 ? "bar" : "bars", value: String(measured.rows) },
    { label: "", value: `${measured.fromValue} → ${measured.toValue}` },
    { label: "", value: `${measured.fromX} → ${measured.toX}` },
  ];
}

/** A measurement in pixels on a model: the band where its ends are now, and its card beside it, inside the plot. */
function measureView(measuring: Measuring, model: ChartModel): MeasurePlace | null {
  const y = model.yAxes.find((axis) => axis.side === "left")?.scale;
  if (model.x === null || y === undefined) {
    return null;
  }
  const [start, end] = [
    { x: pixel(model.x, measuring.from.x), y: pixel(y, measuring.from.y) },
    { x: pixel(model.x, measuring.to.x), y: pixel(y, measuring.to.y) },
  ];
  const band = {
    height: Math.max(1, Math.abs(end.y - start.y)),
    width: Math.abs(end.x - start.x),
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
  };
  const { plot } = model;
  const right = band.x + band.width + cardGap;
  const left =
    right + cardWidth > plot.x + plot.width
      ? Math.max(plot.x, band.x - cardGap - cardWidth)
      : right;
  const top = Math.max(plot.y, Math.min(band.y, plot.y + plot.height - cardRoom));
  return { band, card: { x: left, y: top } };
}

export { cardWidth, measureLines, measureView };
export type { MeasureCard, MeasureLine, MeasurePlace, MeasureState, Measuring };
