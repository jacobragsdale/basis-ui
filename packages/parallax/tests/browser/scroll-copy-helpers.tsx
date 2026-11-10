/* Helpers for the tests of a scroll that moves pixels: a grid of wide rows that each draw differently, a scroll that
 * reports what its one draw did, and the canvas as a full redraw paints it, pixel for pixel. */

import { Table, Utf8, makeVector, tableToIPC, vectorFromArray } from "apache-arrow";
import type { Vector } from "apache-arrow";
import { createRef } from "react";
import type { RefObject } from "react";
import { expect } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import type { RenderResult } from "vitest-browser-react";

import type { WorkerPort } from "#engine/port.ts";
import type { GridProps } from "#grid/grid.tsx";
import { metricsOf } from "#grid/paint/metrics.ts";
import type { Metrics } from "#grid/paint/metrics.ts";
import type { DrawStats } from "#grid/paint/stats.ts";
import type { GridHandle } from "#grid/use-grid-handles.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { readTheme } from "#theme/read.ts";

import { startWorker } from "./data.ts";
import { canvasOf } from "./grid-helpers.tsx";
import { GridPage } from "./grid-page.tsx";

const tableRows = 3000;
const books = ["Rates", "Credit", "Macro", "Equity"];
const tickers = ["UST2Y", "UST10Y", "BUND", "GILT", "JGB", "OAT", "BTP", "ACGB"];
const textColumns = 6;
const numberColumns = 6;
/** The numbers' spread and shift, so that some are negative and each column differs from the next. */
const spread = 997;
const shift = 300.25;
const stride = 3;
/** A row far enough down that moving there and back paints the canvas whole. */
const farRow = 2000;
const channels = 4;
const settleFrames = 5;
const drawFrames = 3;

/** `tableRows` values of `value(row)`. */
function column<TValue>(value: (row: number) => TValue): TValue[] {
  return Array.from({ length: tableRows }, (_entry, row) => value(row));
}

/** Text column `index`: a ticker and the row's number. */
function tickerColumn(index: number): Vector {
  const text = (row: number): string =>
    `${tickers[(row + index) % tickers.length] ?? ""} ${String(row)}`;
  return vectorFromArray(column(text), new Utf8());
}

/** Number column `index`: a spread of values, some negative. */
function amountColumn(index: number): Vector {
  const values = Float64Array.from(column((row) => ((row * (index + stride)) % spread) - shift));
  return makeVector(values);
}

/** Rows of an id, a book, six tickers and six numbers, some negative, so that each row draws differently. */
function wideBytes(): ArrayBuffer {
  const vectors: Record<string, Vector> = {
    book: vectorFromArray(
      column((row) => books[row % books.length] ?? ""),
      new Utf8(),
    ),
    id: makeVector(Int32Array.from(column((row) => row))),
  };
  for (let index = 0; index < textColumns; index += 1) {
    vectors[`ticker_${String(index)}`] = tickerColumn(index);
  }
  for (let index = 0; index < numberColumns; index += 1) {
    vectors[`amount_${String(index)}`] = amountColumn(index);
  }
  return new Uint8Array(tableToIPC(new Table(vectors), "stream")).buffer;
}

async function nextFrame(): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  requestAnimationFrame(resolve);
  return promise;
}

async function frames(count = drawFrames): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- frames come one after another.
    await nextFrame();
  }
}

/** A rendered grid: its scrolling element, its canvas, its sizes, its drawing counters, and a move of the pointer off
 * it. */
interface Shown {
  readonly scroll: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly metrics: Metrics;
  readonly stats: () => DrawStats;
  readonly away: () => Promise<void>;
}

/** What the test renders: the layout, the grid's props, and the engine's worker. */
interface Shows {
  readonly layout?: LayoutInput;
  readonly grid?: Partial<GridProps>;
  readonly worker?: () => WorkerPort;
  /** The rows the grid shows, the table's unless grouped. */
  readonly rows?: number;
}

function htmlOf(element: Element): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError("The grid is not an HTML element.");
  }
  return element;
}

/** The grid rendered on `screen`, once its rows are drawn, with the pointer off it. */
async function shownOf(
  screen: RenderResult,
  { ref, rows }: { readonly ref: RefObject<GridHandle | null>; readonly rows: number },
): Promise<Shown> {
  const element = screen.getByRole("grid");
  await expect.element(element).toHaveAttribute("aria-rowcount", String(rows));
  const away = async (): Promise<void> => userEvent.hover(screen.getByTestId("away"));
  const stats = (): DrawStats => ref.current?.drawStats() ?? expect.unreachable("no handle");
  await expect.poll(() => ref.current?.drawStats().frames ?? 0).toBeGreaterThan(0);
  await away();
  await frames();
  const canvas = canvasOf(element);
  return {
    away,
    canvas,
    metrics: metricsOf(readTheme(canvas)),
    scroll: htmlOf(element.element()),
    stats,
  };
}

/** Renders a grid of the wide rows, waits for them to be drawn, and moves the pointer off it, so that no row's hover
 * is drawn. */
async function showGrid({
  layout = {},
  grid = {},
  worker = startWorker,
  rows = tableRows,
}: Shows = {}): Promise<Shown> {
  const ref = createRef<GridHandle>();
  const screen = await render(
    <ParallaxProvider worker={worker}>
      <p data-testid="away">Above the grid</p>
      <GridPage source={wideBytes} layout={layout} grid={grid} gridRef={ref} />
    </ParallaxProvider>,
  );
  return shownOf(screen, { ref, rows });
}

/** The canvas's pixels. */
function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const context = canvas.getContext("2d") ?? expect.unreachable("no 2D context");
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** How many device pixels differ between two pictures of a canvas, and the first row where one does. */
function differences(
  canvas: HTMLCanvasElement,
  [first, second]: readonly [Uint8ClampedArray, Uint8ClampedArray],
): { readonly count: number; readonly firstRow: number | null } {
  let count = 0;
  let firstRow: number | null = null;
  for (let at = 0; at < first.length; at += channels) {
    if ([0, 1, 2].some((channel) => first[at + channel] !== second[at + channel])) {
      count += 1;
      firstRow ??= Math.floor(at / channels / canvas.width);
    }
  }
  return { count, firstRow };
}

/** What the canvas shows once it stops changing. */
async function settled(canvas: HTMLCanvasElement): Promise<Uint8ClampedArray> {
  await expect
    .poll(async () => {
      const was = canvas.toDataURL();
      await frames(settleFrames);
      return canvas.toDataURL() === was;
    })
    .toBe(true);
  return pixels(canvas);
}

/** The canvas as a full redraw paints it where the grid is now: it moves far down and back, which copies nothing. */
async function paintedWhole({ scroll, canvas, metrics, stats }: Shown): Promise<Uint8ClampedArray> {
  const top = scroll.scrollTop;
  const before = stats().fullDraws;
  scroll.scrollTop = top + farRow * metrics.rowPx;
  await settled(canvas);
  scroll.scrollTop = top;
  const whole = await settled(canvas);
  expect(stats().fullDraws - before).toBeGreaterThanOrEqual(2);
  return whole;
}

/** What one draw did: how many copies and full redraws, and the device pixels it painted. */
interface OneDraw {
  readonly copies: number;
  readonly fullDraws: number;
  readonly paintedPx: number;
}

/** Scrolls by `rows` rows and `left` CSS pixels across, waits for the draw, and returns what it did. */
async function scrollBy(
  { scroll, metrics, stats }: Shown,
  { rows = 0, left = 0 }: { readonly rows?: number; readonly left?: number },
): Promise<OneDraw> {
  const before = stats();
  scroll.scrollTop += rows * metrics.rowPx;
  scroll.scrollLeft += left;
  await frames();
  const after = stats();
  return {
    copies: after.copies - before.copies,
    fullDraws: after.fullDraws - before.fullDraws,
    paintedPx: after.paintedPx - before.paintedPx,
  };
}

/** Expects the canvas, once it stops changing, to be what a full redraw paints, pixel for pixel. */
async function expectPaintedWhole(shown: Shown): Promise<void> {
  const copied = await settled(shown.canvas);
  const whole = await paintedWhole(shown);
  expect(differences(shown.canvas, [copied, whole])).toStrictEqual({ count: 0, firstRow: null });
}

/** The device pixels of `rows` rows across the canvas. */
function rowsArea({ canvas, metrics }: Shown, rows: number): number {
  return rows * metrics.rowPx * globalThis.devicePixelRatio * canvas.width;
}

export {
  differences,
  expectPaintedWhole,
  frames,
  paintedWhole,
  pixels,
  rowsArea,
  scrollBy,
  settled,
  showGrid,
};
export type { OneDraw, Shown };
