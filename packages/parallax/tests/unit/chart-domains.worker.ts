/* Builds draw models over degenerate value ranges in a worker thread, so that the test which starts it can stop one
 * that never returns. Each message names a case; the answer is what its value axes came to. */

import { parentPort } from "node:worker_threads";

import type { ChartContent } from "#frame/chart-data.ts";
import type { CategoryData, ChartModel } from "#chart/model-types.ts";
import { parseLayout } from "#layout/layout.ts";
import type { LayoutInput } from "#layout/layout.ts";

import { categoriesOf, frameOf, modelOf, seriesFrame, seriesOf } from "./chart-model-inputs.ts";

/** What a model is drawn from. */
type Data = Parameters<typeof modelOf>[1];

/** What a case's value axes came to: how many ticks, and whether every tick and the plot are finite numbers. */
interface Answer {
  readonly ticks: number;
  readonly finite: boolean;
  /** What the model threw, if it did. */
  readonly error?: string;
}

/** The formats a value axis is labelled in. */
const styles: Readonly<Record<string, NonNullable<LayoutInput["formats"]>[string]>> = {
  bps: { bps: true },
  par: { suffixes: "par" },
  percent: { percent: true },
  plain: {},
  "thirty-seconds": { thirty_seconds: "thirty_seconds" },
};

function answerOf(model: ChartModel): Answer {
  const ticks = model.yAxes.flatMap((axis) => axis.ticks);
  const numbers = [
    ...ticks.flatMap((tick) => [tick.px, tick.value]),
    ...model.yAxes.flatMap((axis) => [...axis.scale.domain]),
    model.plot.x,
    model.plot.width,
  ];
  return { finite: numbers.every((value) => Number.isFinite(value)), ticks: ticks.length };
}

/** The ends of `values`' finite values. */
function endsOf(values: readonly number[]): readonly [number, number] {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length === 0 ? [0, 1] : [Math.min(...finite), Math.max(...finite)];
}

/** A scatter's density of one cell, over the values' ends. */
function densityOf(values: readonly number[]): ChartContent {
  const [yFrom, yTo] = endsOf(values);
  return { columns: 1, counts: Uint32Array.from([1]), kind: "density", rows: 1, yFrom, yTo };
}

/** One group a bar per value. */
function groupsOf(values: readonly number[]): CategoryData {
  return categoriesOf(
    values.map((_value, i) => `g${String(i)}`),
    [{ label: "close", texts: values.map(String), values }],
  );
}

/** Each form's chart and data over `values`. */
const charts: Readonly<
  Record<string, (values: readonly number[]) => readonly [NonNullable<LayoutInput["chart"]>, Data]>
> = {
  bar: (values) => [{ kind: "bar", y: ["close"] }, { categories: groupsOf(values) }],
  density: (values) => [{ kind: "scatter", y: ["close"] }, { frame: frameOf(densityOf(values)) }],
  left: (values) => [{ kind: "line" }, { frame: seriesFrame([seriesOf("a", values)]) }],
  log: (values) => [{ kind: "line", log_y: true }, { frame: seriesFrame([seriesOf("a", values)]) }],
  right: (values) => [
    { kind: "line", y_right: ["b"] },
    { frame: seriesFrame([seriesOf("a", [1, 2]), seriesOf("b", values, true)]) },
  ],
};

/** The model of `values` drawn as `form`, its value axis labelled in `style`. */
function modelFor(form: string, style: string, values: readonly number[]): ChartModel {
  const { formats } = parseLayout({ formats: { close: styles[style] ?? {} } });
  const chart = charts[form];
  if (chart === undefined) {
    throw new Error(`No form ${form}.`);
  }
  const [layout, data] = chart(values);
  return modelOf(layout, data, { formats });
}

parentPort?.on("message", (message: { form: string; style: string; values: number[] }) => {
  try {
    parentPort?.postMessage(answerOf(modelFor(message.form, message.style, message.values)), []);
  } catch (error) {
    parentPort?.postMessage({ error: String(error), finite: false, ticks: 0 }, []);
  }
});

// Its modules are loaded: the test times each model from here, not the worker's start, which a busy runner makes slow.
parentPort?.postMessage({ ready: true }, []);

export type { Answer };
