/* Chart frames: a chart the engine reduced to its plot, decoded from Arrow IPC.
 *
 * A chart frame crosses an I/O boundary, so each column is checked against the type the protocol promises before
 * drawing code reads it. Positions arrive as doubles on the axis; every value a tooltip shows arrives as the engine's
 * text. */

import { Table, tableFromIPC } from "apache-arrow";

import type { ChartFrame } from "#proto/parallax_pb.ts";

import { ChartColumns, runs } from "./chart-columns.ts";
import type {
  CandleData,
  ChartContent,
  ChartFrameData,
  FitLineData,
  HistogramSeries,
  IndicatorLineData,
  PointSeries,
  SeriesData,
} from "./chart-data.ts";
import { FrameError } from "./readers.ts";

/** A batch of a chart frame, which must decode synchronously. */
function columnsOf(bytes: Uint8Array, what: string): ChartColumns {
  const decoded = tableFromIPC(bytes);
  if (!(decoded instanceof Table)) {
    throw new FrameError(`A chart frame's ${what} must decode synchronously.`);
  }
  return new ChartColumns(decoded);
}

function decodeSeries(frame: ChartFrame, columns: ChartColumns): readonly SeriesData[] {
  const spans = runs(columns.counts32("series"), frame.series.length);
  const x = columns.floats("x");
  const y = columns.floats("y");
  const xText = columns.texts("x_text");
  const yText = columns.texts("y_text");
  const xJson = columns.texts("x_json");
  return frame.series.map((series, index) => {
    const [from, to] = spans[index] ?? [0, 0];
    return {
      column: series.column,
      label: series.label,
      right: series.right,
      x: x.subarray(from, to),
      xJson: xJson.slice(from, to),
      xText: xText.slice(from, to),
      y: y.subarray(from, to),
      yText: yText.slice(from, to),
    };
  });
}

/** The tooltip columns a scatter's dots carry, `tooltip_0` and on, in order. */
function tooltipTexts(columns: ChartColumns): readonly (readonly (string | null)[])[] {
  const texts: (readonly (string | null)[])[] = [];
  for (let i = 0; columns.has(`tooltip_${String(i)}`); i += 1) {
    texts.push(columns.texts(`tooltip_${String(i)}`));
  }
  return texts;
}

function decodePoints(frame: ChartFrame, columns: ChartColumns): readonly PointSeries[] {
  const spans = runs(columns.counts32("series"), frame.series.length);
  const [x, y, size] = [columns.floats("x"), columns.floats("y"), columns.floats("size")];
  const [xText, yText] = [columns.texts("x_text"), columns.texts("y_text")];
  const [sizeText, fitText] = [columns.texts("size_text"), columns.texts("fit_text")];
  const [idText, idJson] = [columns.texts("id_text"), columns.texts("id_json")];
  const tooltip = tooltipTexts(columns);
  return frame.series.map((series, index) => {
    const [from, to] = spans[index] ?? [0, 0];
    return {
      fitText: fitText.slice(from, to),
      idJson: idJson.slice(from, to),
      idText: idText.slice(from, to),
      label: series.label,
      size: size.subarray(from, to),
      sizeText: sizeText.slice(from, to),
      tooltip: tooltip.map((texts) => texts.slice(from, to)),
      x: x.subarray(from, to),
      xText: xText.slice(from, to),
      y: y.subarray(from, to),
      yText: yText.slice(from, to),
    };
  });
}

function decodeCandles(frame: ChartFrame, columns: ChartColumns): CandleData {
  return {
    close: columns.floats("close"),
    closeText: columns.texts("close_text"),
    endJson: columns.texts("end_json"),
    from: columns.floats("from"),
    high: columns.floats("high"),
    highText: columns.texts("high_text"),
    interval: frame.interval,
    low: columns.floats("low"),
    lowText: columns.texts("low_text"),
    open: columns.floats("open"),
    openText: columns.texts("open_text"),
    to: columns.floats("to"),
    volume: columns.has("volume") ? columns.floats("volume") : null,
    volumeText: columns.has("volume_text") ? columns.texts("volume_text") : null,
    xJson: columns.texts("x_json"),
    xText: columns.texts("x_text"),
  };
}

function decodeHistogram(frame: ChartFrame, columns: ChartColumns): readonly HistogramSeries[] {
  const spans = runs(columns.counts32("series"), frame.series.length);
  const from = columns.floats("from");
  const to = columns.floats("to");
  const counts = columns.counts64("count");
  const fromText = columns.texts("from_text");
  const toText = columns.texts("to_text");
  return frame.series.map((series, index) => {
    const [first, end] = spans[index] ?? [0, 0];
    return {
      counts: counts.slice(first, end),
      from: from.subarray(first, end),
      fromText: fromText.slice(first, end),
      label: series.label,
      to: to.subarray(first, end),
      toText: toText.slice(first, end),
    };
  });
}

function decodeDensity(frame: ChartFrame, columns: ChartColumns): ChartContent {
  const counts = columns.counts32("count");
  if (counts.length !== frame.columns * frame.rows) {
    throw new FrameError("A density's cells do not match its size.");
  }
  return {
    columns: frame.columns,
    counts,
    kind: "density",
    rows: frame.rows,
    yFrom: frame.yFrom,
    yTo: frame.yTo,
  };
}

function decodeContent(frame: ChartFrame, columns: ChartColumns): ChartContent {
  if (columns.has("size")) {
    return {
      kind: "points",
      series: decodePoints(frame, columns),
      yFrom: frame.yFrom,
      yTo: frame.yTo,
    };
  }
  if (columns.has("y")) {
    return { kind: "series", series: decodeSeries(frame, columns) };
  }
  if (columns.has("open")) {
    return { candles: decodeCandles(frame, columns), kind: "candles" };
  }
  if (columns.has("from")) {
    return { kind: "histogram", series: decodeHistogram(frame, columns) };
  }
  return decodeDensity(frame, columns);
}

/** A frame's indicator lines, from their own batch. */
function decodeIndicators(frame: ChartFrame): readonly IndicatorLineData[] {
  if (frame.indicatorLines.length === 0) {
    return [];
  }
  const columns = columnsOf(frame.indicatorBatch, "indicator batch");
  const spans = runs(columns.counts32("line"), frame.indicatorLines.length);
  const x = columns.floats("x");
  const y = columns.floats("y");
  const xText = columns.texts("x_text");
  const yText = columns.texts("y_text");
  return frame.indicatorLines.map((line, index) => {
    const [from, to] = spans[index] ?? [0, 0];
    return {
      indicator: line.indicator,
      line: line.line,
      series: line.series,
      x: x.subarray(from, to),
      xText: xText.slice(from, to),
      y: y.subarray(from, to),
      yText: yText.slice(from, to),
    };
  });
}

/** A scatter's fit lines, from their own batch. */
function decodeFits(frame: ChartFrame): readonly FitLineData[] {
  if (frame.fits.length === 0) {
    return [];
  }
  const columns = columnsOf(frame.fitBatch, "fit batch");
  const spans = runs(columns.counts32("series"), frame.fits.length);
  const [x, y] = [columns.floats("x"), columns.floats("y")];
  const [xText, yText] = [columns.texts("x_text"), columns.texts("y_text")];
  return frame.fits.map((fit, index) => {
    const [from, to] = spans[index] ?? [0, 0];
    return {
      label: fit.label,
      x: x.subarray(from, to),
      xText: xText.slice(from, to),
      y: y.subarray(from, to),
      yText: yText.slice(from, to),
    };
  });
}

/** A JSON value's text as JavaScript writes it, so that `2.0` and `2` are one key; null for text that is not JSON. */
function canonicalJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return null;
  }
}

function isRange(from: number, to: number): boolean {
  return Number.isFinite(from) && Number.isFinite(to) && to >= from;
}

/** Where each value the layout's drawings are anchored to sits on the axis, by the value's canonical JSON. */
function anchorsOf(frame: ChartFrame): ReadonlyMap<string, number> {
  return new Map(
    frame.anchors.flatMap((anchor): [string, number][] => {
      const key = canonicalJson(anchor.xJson);
      return key === null ? [] : [[key, anchor.position]];
    }),
  );
}

/** Decodes and checks a chart frame. */
function decodeChartFrame(frame: ChartFrame): ChartFrameData {
  const columns = columnsOf(frame.batch, "batch");
  if (!isRange(frame.xFrom, frame.xTo)) {
    throw new FrameError("A chart frame's x range is not a range.");
  }
  if (!isRange(frame.extentFrom, frame.extentTo)) {
    throw new FrameError("A chart frame's x extent is not a range.");
  }
  return {
    anchors: anchorsOf(frame),
    configVersion: frame.configVersion,
    content: decodeContent(frame, columns),
    events: frame.events.map((event) => ({
      series: event.series,
      text: event.text,
      x: event.x,
      xText: event.xText,
    })),
    eventsTotal: frame.eventsTotal,
    extentFrom: frame.extentFrom,
    extentTo: frame.extentTo,
    fits: decodeFits(frame),
    indicators: decodeIndicators(frame),
    loadVersion: frame.loadVersion,
    pushed: frame.pushed,
    sourceAsOfMicros: frame.sourceAsOfMicros,
    ticks: frame.ticks.map((tick) => ({ label: tick.label, x: tick.x })),
    viewId: frame.viewId,
    xFrom: frame.xFrom,
    xTo: frame.xTo,
  };
}

export { canonicalJson, decodeChartFrame };
