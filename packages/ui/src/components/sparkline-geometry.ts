/* A Sparkline's geometry: its values as an SVG path in a box, broken where a value is missing, with the area under it
 * and its last point, worked out without the DOM so that tests can check it. */

/** A value of a sparkline: a number, or null or NaN where it is missing, which breaks the line. */
type SparkValue = number | null;

/** Where a sparkline is drawn: its box, and the room kept inside it so that the line's stroke and dot show whole. */
interface SparkBox {
  readonly width: number;
  readonly height: number;
  readonly inset: number;
}

/** A sparkline's paths and its last drawn point. */
interface SparkGeometry {
  /** The line, an SVG path of one run per stretch of values without a gap; "" with no value. */
  readonly line: string;
  /** The area between each run and the box's bottom, as one closed path per run. */
  readonly area: string;
  /** The last value's point, or null when the last value is missing. */
  readonly last: { readonly x: number; readonly y: number } | null;
}

/** Whether `value` is a number to draw. */
function present(value: SparkValue | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

/** The lowest and highest values drawn, or null with none. */
function rangeOf(values: readonly SparkValue[]): readonly [number, number] | null {
  let [low, high] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const value of values) {
    if (present(value)) {
      [low, high] = [Math.min(low, value), Math.max(high, value)];
    }
  }
  return low <= high ? [low, high] : null;
}

/** A coordinate to two decimals, which an SVG path needs no more of. */
function at(value: number): string {
  const hundredths = 100;
  return String(Math.round(value * hundredths) / hundredths);
}

/** A point of the line, in the box's units. */
interface SparkPoint {
  readonly x: number;
  readonly y: number;
}

/** Where value `i` of `count`, of `value`, sits in `box` between `low` and `high`. */
function placer(
  box: SparkBox,
  { count, low, high }: { readonly count: number; readonly low: number; readonly high: number },
): (i: number, value: number) => SparkPoint {
  const [left, right] = [box.inset, box.width - box.inset];
  const [top, bottom] = [box.inset, box.height - box.inset];
  return (i, value) => ({
    x: count === 1 ? box.width / 2 : left + ((right - left) * i) / (count - 1),
    y: high === low ? box.height / 2 : bottom - ((bottom - top) * (value - low)) / (high - low),
  });
}

/** The line's runs: its points between missing values. */
function runsOf(
  values: readonly SparkValue[],
  place: (i: number, value: number) => SparkPoint,
): SparkPoint[][] {
  const runs: SparkPoint[][] = [[]];
  for (const [i, value] of values.entries()) {
    const run = runs.at(-1) ?? [];
    if (present(value)) {
      run.push(place(i, value));
    } else if (run.length > 0) {
      runs.push([]);
    }
  }
  return runs.filter((run) => run.length > 0);
}

/** A run as a path's moves and lines. */
function runPath(run: readonly SparkPoint[]): string {
  return run.map((point, i) => `${i === 0 ? "M" : "L"}${at(point.x)} ${at(point.y)}`).join("");
}

/** A run's area, closed down to the box's bottom. */
function areaPath(run: readonly SparkPoint[], height: number): string {
  const [first] = run;
  const final = run.at(-1);
  if (first === undefined || final === undefined) {
    return "";
  }
  const lines = run.map((point) => `L${at(point.x)} ${at(point.y)}`).join("");
  return `M${at(first.x)} ${at(height)}${lines}L${at(final.x)} ${at(height)}Z`;
}

/**
 * The geometry of `values` in `box`: evenly spaced across it, the lowest value at the bottom and the highest at the top,
 * and a flat series across its middle. A single value is a point at the middle of the box's width.
 */
function sparkGeometry(values: readonly SparkValue[], box: SparkBox): SparkGeometry {
  const range = rangeOf(values);
  if (range === null) {
    return { area: "", last: null, line: "" };
  }
  const [low, high] = range;
  const place = placer(box, { count: values.length, high, low });
  const runs = runsOf(values, place);
  const lastValue = values.at(-1);
  return {
    area: runs.map((run) => areaPath(run, box.height)).join(""),
    last: present(lastValue) ? place(values.length - 1, lastValue) : null,
    line: runs.map((run) => runPath(run)).join(""),
  };
}

/** Whether a series rose, fell or held from its first value drawn to its last. */
function trendOf(values: readonly SparkValue[]): "up" | "down" | "flat" {
  const drawn = values.filter((value) => present(value));
  const [first] = drawn;
  const final = drawn.at(-1);
  if (first === undefined || final === undefined || first === final) {
    return "flat";
  }
  return final > first ? "up" : "down";
}

export { sparkGeometry, trendOf };
export type { SparkBox, SparkGeometry, SparkValue };
