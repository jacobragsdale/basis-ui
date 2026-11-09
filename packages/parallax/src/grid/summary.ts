/* The status bar's reading of the numbers selected, as a spreadsheet's status bar gives one: their mean, the smallest
 * and the largest, their sum and how many there are, once more than one cell is selected. The sum is exact, by
 * `sumPrecise`, and the mean is that sum over the count. Each is written in the format the selected columns share, a
 * yield's in percent and a price's in 32nds, or in plain numbers when they share none. Rows the frame on screen does
 * not hold are fetched, as a copy fetches them, for a selection of up to `cellCap` cells; a larger one has no reading,
 * since every cell's text would cross from the engine for it. */

import { createFormatter } from "@basis/ui";
import type { Format, Formatter } from "@basis/ui";
import { sumPrecise } from "@basis/ui/numbers";

import type { ViewHandle } from "#engine/view.ts";
import type { CellValue } from "#frame/cell.ts";
import type { FrameColumn } from "#frame/columns.ts";
import type { FrameData } from "#frame/frame.ts";
import { exactDecimal } from "#format.ts";
import type { Layout, LayoutFormat, LayoutMeasure } from "#layout/layout.ts";

import { holds, windowOf } from "./copy.ts";
import type { GridModel } from "./model.ts";
import { rangeOf } from "./selection.ts";
import type { CellRange } from "./selection.ts";

/** One figure of the reading: its name, its value as text, and how wide a status bar must be to show it: the sum
 * always shows, the mean from a small width, the count from a medium one and the extremes from a wide one. */
interface Figure {
  readonly label: string;
  readonly value: string;
  readonly from: "any" | "small" | "medium" | "wide";
}

/** The largest selection read; past it, the rows' text would cost more to fetch than the reading is worth. */
const cellCap = 100_000;
/** How long a selection rests before rows the frame lacks are fetched for it, so a drag fetches once. */
const restMs = 150;
const none: readonly Figure[] = [];

/** A measure's format: its own, a share's percentage, or its column's, for aggregates in the column's units. */
function measureFormat(
  measure: LayoutMeasure,
  columnFormat: (name: string) => LayoutFormat | null,
): LayoutFormat | null {
  if (measure.format !== null) {
    return measure.format;
  }
  const inUnits = !["count", "count_all", "distinct_count", "variance"].includes(measure.aggregate);
  if (measure.show_as.startsWith("percent_of") || measure.column === null || !inUnits) {
    return null;
  }
  return columnFormat(measure.column);
}

/** The format data column `column` is shown in: the layout's for its column or measure, else the API's declared one. */
function formatOf(model: GridModel, column: number): LayoutFormat | null {
  const { layout } = model;
  if (layout === null) {
    return null;
  }
  const columnFormat = (name: string): LayoutFormat | null =>
    layout.formats[name] ?? model.fields.find((field) => field.name === name)?.format ?? null;
  if (!model.pivot) {
    return columnFormat(model.geometry.widthKey(column));
  }
  const measure = layout.measures[column % Math.max(1, layout.measures.length)];
  return measure === undefined ? null : measureFormat(measure, columnFormat);
}

/** A cell's number, or null for a cell that holds none. */
function numberOf(value: CellValue): number | null {
  switch (value.kind) {
    case "number": {
      return Number.isFinite(value.value) ? value.value : null;
    }
    case "integer": {
      return Number(value.value);
    }
    case "decimal": {
      return Number(exactDecimal(value.unscaled, value.scale));
    }
    case "null":
    case "text":
    case "boolean":
    case "date":
    case "timestamp": {
      return null;
    }
    default: {
      return value satisfies never;
    }
  }
}

/** The numbers of one data column's selected rows, skipping cells the engine flagged. */
function columnNumbers(data: FrameColumn, frame: FrameData, range: CellRange): number[] {
  const numbers: number[] = [];
  for (let row = range.top; row <= range.bottom; row += 1) {
    const local = row - frame.firstRow;
    const value = data.flag(local) === "ok" ? numberOf(data.value(local)) : null;
    if (value !== null) {
      numbers.push(value);
    }
  }
  return numbers;
}

/** The data columns a range covers. */
function columnsOf(range: CellRange): readonly number[] {
  const first = Math.max(0, range.left);
  return Array.from({ length: Math.max(0, range.right - first + 1) }, (_unused, i) => first + i);
}

/** The selected numbers, and the format their columns share, or null when they share none. */
function selectedNumbers(
  frame: FrameData,
  range: CellRange,
  format: (column: number) => LayoutFormat | null,
): { readonly numbers: readonly number[]; readonly shared: LayoutFormat | null } {
  const found = columnsOf(range)
    .map((column) => {
      const data = frame.columns[column - frame.firstColumn];
      return { column, numbers: data?.numeric === true ? columnNumbers(data, frame, range) : [] };
    })
    .filter((entry) => entry.numbers.length > 0);
  const formats = found.map((entry) => format(entry.column));
  const [first] = formats;
  const shared = new Set(formats.map((each) => JSON.stringify(each))).size === 1 ? first : null;
  return { numbers: found.flatMap((entry) => entry.numbers), shared: shared ?? null };
}

const abbreviations = { billions: "B", millions: "M", thousands: "K" } as const;
const precisions = {
  eighths: "eighths",
  halves: "halves",
  quarters: "quarters",
  thirty_seconds: "thirty-seconds",
} as const;

/** `@basis/ui`'s formatter for a layout format, which writes as the engine does; plain numbers for none, or for a
 * format the formatter refuses. */
function formatterFor(format: LayoutFormat | null): Formatter {
  if (format === null) {
    return createFormatter({});
  }
  const settings: Format = {
    abbreviate: format.abbreviate === null ? null : abbreviations[format.abbreviate],
    decimals: format.decimals,
    negative: format.negative,
    percent: format.percent,
    thirtySeconds: format.thirty_seconds === undefined ? null : precisions[format.thirty_seconds],
    thousands: format.thousands,
    ...(format.bps === undefined ? {} : { bps: format.bps }),
    ...(format.suffixes === undefined ? {} : { suffixes: format.suffixes }),
  };
  try {
    return createFormatter(settings);
  } catch {
    return createFormatter({});
  }
}

/** The smallest and largest of some numbers, by a loop, since spreading many into `Math.min` overflows the stack. */
function extentOf(numbers: readonly number[]): readonly [number, number] {
  let [low, high] = [Infinity, -Infinity];
  for (const value of numbers) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return [low, high];
}

/** The figures of a selection's numbers. Whole numbers with no format are written whole, but for their mean. */
function figuresOf(numbers: readonly number[], format: LayoutFormat | null): readonly Figure[] {
  const written = formatterFor(format);
  const whole = format === null && numbers.every((value) => Number.isInteger(value));
  const exact = whole ? createFormatter({ decimals: 0 }) : written;
  const sum = sumPrecise(numbers);
  const [low, high] = extentOf(numbers);
  return [
    { from: "small", label: "Avg", value: written.float(sum / numbers.length) },
    { from: "wide", label: "Min", value: exact.float(low) },
    { from: "wide", label: "Max", value: exact.float(high) },
    { from: "any", label: "Sum", value: exact.float(sum) },
    { from: "medium", label: "Count", value: createFormatter({}).integer(numbers.length) },
  ];
}

/** The reading of the selected cells a frame holds. */
function readingOf(model: GridModel, frame: FrameData, range: CellRange): readonly Figure[] {
  const { numbers, shared } = selectedNumbers(frame, range, (column) => formatOf(model, column));
  return numbers.length === 0 ? none : figuresOf(numbers, shared);
}

/** How many cells a range holds. */
function cellsOf(range: CellRange): number {
  return (range.bottom - range.top + 1) * (range.right - range.left + 1);
}

/** What a reading is asked of: the frame, the range of data cells selected, and what identifies the range in this
 * layout and load; null for no selection, a single cell, or the group column alone. */
interface Asked {
  readonly frame: FrameData;
  readonly range: CellRange;
  readonly key: string;
}

function askedOf(model: GridModel): Asked | null {
  const { frame } = model;
  const { selection } = model.interaction;
  const range = selection === null ? null : rangeOf(selection);
  if (frame === null || range === null || range.right < 0 || cellsOf(range) < 2) {
    return null;
  }
  const key = JSON.stringify([frame.configVersion.toString(), frame.loadVersion.toString(), range]);
  return { frame, key, range };
}

/** A grid's reading of its selection, kept until the selection, the layout or the load changes: a layout that only
 * changes a format keeps the view's version, so the layout itself is kept to tell. */
class SelectionReading {
  readonly #handle: () => ViewHandle | null;
  readonly #changed: () => void;
  #layout: Layout | null = null;
  #key = "";
  #figures: readonly Figure[] = none;
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** `handle` fetches rows the frame lacks; `changed` says a fetched reading arrived. */
  public constructor(handle: () => ViewHandle | null, changed: () => void) {
    this.#handle = handle;
    this.#changed = changed;
  }

  /** The reading of the model's selection: at once from the frame, or none until rows it lacks arrive. */
  public figures(model: GridModel): readonly Figure[] {
    const asked = askedOf(model);
    if (asked === null) {
      return this.#settle("", none);
    }
    if (asked.key === this.#key && model.layout === this.#layout) {
      return this.#figures;
    }
    if (holds(asked.frame, asked.range)) {
      return this.#settle(asked.key, readingOf(model, asked.frame, asked.range), model.layout);
    }
    this.#settle(asked.key, none, model.layout);
    this.#later(model, asked);
    return none;
  }

  /** Fetches the rows a selection of up to `cellCap` cells needs, once it has rested. */
  #later(model: GridModel, asked: Asked): void {
    if (cellsOf(asked.range) <= cellCap) {
      this.#timer = setTimeout(() => {
        this.#fetch(model, asked).catch(reportError);
      }, restMs);
    }
  }

  /** Keeps a reading for `key` in `layout`, dropping a fetch for another. */
  #settle(
    key: string,
    figures: readonly Figure[],
    layout: Layout | null = null,
  ): readonly Figure[] {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#layout = layout;
    this.#key = key;
    this.#figures = figures;
    return figures;
  }

  async #fetch(model: GridModel, { key, range }: Asked): Promise<void> {
    this.#timer = null;
    const frame = await this.#handle()?.fetch(windowOf(range));
    if (frame !== undefined && this.#key === key && holds(frame, range)) {
      this.#figures = readingOf(model, frame, range);
      this.#changed();
    }
  }
}

export { SelectionReading, formatterFor };
export type { Figure };
