/* The performance overlay's figures, from what it samples: frame times, long frames, each grid's drawing counters and
 * the tab's memory, as the lines it shows and the report it copies. */

import type { DrawStats } from "@basis/parallax";

import type { GridStats } from "./grid-stats.ts";

/** How long before a layout change was sent an input can have caused it, in milliseconds. */
const inputWindowMs = 1000;
const median = 50;
const ninetyFifth = 95;
const megabyte = 1_048_576;

interface Memory {
  readonly bytes: number;
  readonly scope: string;
}

/** One sample of one grid's counters. */
interface GridFigures {
  /** Empty when the page shows one grid or none. */
  readonly name: string;
  readonly drawMsPerFrame: number | null;
  readonly latency: readonly number[];
  readonly inputToScreen: readonly number[];
  readonly firstRows: DrawStats["firstRows"];
  /** Draws since the grid opened, and how many of them redrew everything rather than the cells that changed. */
  readonly draws: { readonly all: number; readonly full: number } | null;
}

/** One sample of the counters the overlay shows. */
interface Figures {
  readonly frameP50: number;
  readonly frameP95: number;
  readonly longFrames: number;
  readonly blockedMsPerSecond: number;
  readonly grids: readonly GridFigures[];
}

/** A line of the overlay: what it measures, and the figure. */
interface Line {
  readonly key: string;
  readonly term: string;
  readonly value: string;
}

/** The `percent`th percentile, interpolating between the two nearest ranks; 0 of nothing. */
function percentile(values: readonly number[], percent: number): number {
  const sorted = values.toSorted((first, second) => first - second);
  const rank = (percent / 100) * (sorted.length - 1);
  const below = sorted[Math.floor(rank)];
  const above = sorted[Math.ceil(rank)];
  if (below === undefined || above === undefined) {
    return 0;
  }
  return below + (above - below) * (rank - Math.floor(rank));
}

/**
 * How long after its input each layout change was drawn. The input is the latest one up to a second before the
 * change was sent; a change with no input in that second, such as one made before the overlay opened, is left out.
 */
function inputToScreen(changes: DrawStats["changes"], inputs: readonly number[]): number[] {
  return changes.flatMap((change) => {
    const before = inputs.filter(
      (at) => at <= change.sentAtMs && at >= change.sentAtMs - inputWindowMs,
    );
    return before.length === 0 ? [] : [change.drawnAtMs - Math.max(...before)];
  });
}

/**
 * The grid's drawing time per frame between two samples of its counters, or `last` if it drew nothing since. A layout
 * change can replace the grid, whose counters then start again, so the figure starts again too.
 */
function drawTime(
  stats: DrawStats,
  previous: DrawStats | null,
  last: number | null,
): number | null {
  if (previous === null) {
    return last;
  }
  if (stats.frames < previous.frames) {
    return null;
  }
  const frames = stats.frames - previous.frames;
  return frames > 0 ? (stats.drawMs - previous.drawMs) / frames : last;
}

/** Each grid's figures from its counters now, its counters a second ago and its last drawing time. */
function gridFigures(
  all: readonly GridStats[],
  previous: ReadonlyMap<string, { readonly stats: DrawStats; readonly drawMs: number | null }>,
  inputs: readonly number[],
): GridFigures[] {
  return all.map(({ name, stats }) => {
    const before = previous.get(name);
    return {
      drawMsPerFrame: drawTime(stats, before?.stats ?? null, before?.drawMs ?? null),
      draws: { all: stats.frames, full: stats.fullDraws },
      firstRows: stats.firstRows,
      inputToScreen: inputToScreen(stats.changes, inputs),
      latency: stats.latencyMs,
      name: all.length > 1 ? name : "",
    };
  });
}

function ms(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)} ms`;
}

/** The median and 95th percentile of some times, and how many there were. */
function spread(values: readonly number[], what: string): string {
  if (values.length === 0) {
    return "n/a";
  }
  const p50 = ms(percentile(values, median));
  const p95 = ms(percentile(values, ninetyFifth));
  return `${p50} median, ${p95} p95 of ${String(values.length)} ${what}`;
}

const noGrid: GridFigures = {
  drawMsPerFrame: null,
  draws: null,
  firstRows: null,
  inputToScreen: [],
  latency: [],
  name: "",
};

/** One grid's lines, each named after the grid when the page shows several. */
function gridLines(grid: GridFigures): Line[] {
  const key = (name: string): string => (grid.name === "" ? name : `${name}-${grid.name}`);
  const term = (name: string): string => (grid.name === "" ? name : `${name} (${grid.name})`);
  const first = grid.firstRows;
  const firstRows =
    first === null
      ? "n/a"
      : `${ms(first.drawnAtMs - first.openedAtMs)} after opening, ${ms(first.drawnAtMs)} after the page began loading`;
  const draws =
    grid.draws === null
      ? "n/a"
      : `${String(grid.draws.all)}, ${String(grid.draws.full)} of them full`;
  return [
    { key: key("draw"), term: term("Grid drawing"), value: `${ms(grid.drawMsPerFrame)} per frame` },
    { key: key("first-rows"), term: term("First rows"), value: firstRows },
    {
      key: key("input"),
      term: term("Input to screen"),
      value: spread(grid.inputToScreen, "changes"),
    },
    { key: key("draws"), term: term("Draws"), value: draws },
    {
      key: key("latency"),
      term: term("Rows asked to drawn"),
      value: spread(grid.latency, "requests"),
    },
  ];
}

/** The overlay's lines for a sample of its figures and the memory last measured. */
function figureLines(figures: Figures, memory: Memory | null): Line[] {
  const frames = `${ms(figures.frameP50)} median, ${ms(figures.frameP95)} p95`;
  const blocked = `${String(figures.longFrames)} in 10 s, ${ms(figures.blockedMsPerSecond)} blocked per s`;
  const grids = figures.grids.length === 0 ? [noGrid] : figures.grids;
  return [
    { key: "frame", term: "Frame time", value: frames },
    { key: "blocked", term: "Long frames", value: blocked },
    ...grids.flatMap((grid) => gridLines(grid)),
    {
      key: "memory",
      term: "Memory",
      value: memory === null ? "n/a" : `${(memory.bytes / megabyte).toFixed(0)} MB`,
    },
    {
      key: "memory-scope",
      term: "Memory covers",
      value: memory?.scope ?? "not measurable in this browser",
    },
  ];
}

/** The machine the figures were taken on, as the report states it. */
interface Machine {
  readonly taken: string;
  readonly page: string;
  readonly showing: string;
  readonly browser: string;
  readonly processors: number;
  readonly window: string;
  readonly isolated: boolean;
}

/** The figures and the machine they were taken on, as plain text. */
function report(lines: readonly Line[], machine: Machine): string {
  return [
    "parallax performance report",
    `Taken: ${machine.taken}`,
    `Page: ${machine.page}`,
    `Showing: ${machine.showing}`,
    `Browser: ${machine.browser}`,
    `Logical processors: ${String(machine.processors)}`,
    `Window: ${machine.window}`,
    `Cross-origin isolated: ${machine.isolated ? "yes" : "no"}`,
    ...lines.map((line) => `${line.term}: ${line.value}`),
  ].join("\n");
}

export { drawTime, figureLines, gridFigures, inputToScreen, percentile, report };
export type { Figures, GridFigures, Line, Machine, Memory };
