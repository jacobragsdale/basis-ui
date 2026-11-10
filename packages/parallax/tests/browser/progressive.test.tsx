/* A first load that shows as it arrives, on the engine's real worker: the rows of the first record batch reach views
 * and the grid before the rest of the body has come, sorts apply to the rows so far and update, an export waits for
 * the whole table, and the status bar says how many rows are still to come. */

import "@basis/ui/styles.css";

import type { ReactNode } from "react";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";
import type { RenderResult } from "vitest-browser-react";

import { BrowserEngine } from "#engine/browser-engine.ts";
import { liftedLimitsKey } from "#engine/limits.ts";
import type { LoadProgress, Loaded } from "#engine/limits.ts";
import type { FrameData } from "#frame/frame.ts";
import { parseLayout } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";
import type { DatasetSource } from "#react/use-dataset.ts";

import { arriving, batchedStream } from "./arriving.ts";
import type { Arriving } from "./arriving.ts";
import { startWorker } from "./data.ts";
import { pressAt } from "./grid-helpers.tsx";
import { GridPage } from "./grid-page.tsx";

/** Three batches of a thousand rows, the second and third held back. */
const stream = batchedStream(3);
/** The middle of the first row, under the header, in the compact density. */
const firstRow = 42;
const layout = JSON.stringify(parseLayout({ dataset: "values" }));

/** A load of the arriving stream on a real engine, with what it heard and the frames of a view opened on its first
 * rows. */
interface Loading {
  readonly engine: BrowserEngine;
  readonly body: Arriving;
  readonly loaded: Promise<Loaded>;
  readonly heard: readonly LoadProgress[];
  readonly frames: readonly FrameData[];
}

/** Starts the load and opens a view as soon as the engine says the dataset holds rows. */
async function loadAndOpen(): Promise<Loading> {
  const engine = new BrowserEngine(startWorker);
  const body = arriving(stream);
  const heard: LoadProgress[] = [];
  const loaded = engine.load("values", body.response, {
    onProgress: (progress): void => {
      heard.push(progress);
    },
  });
  const frames: FrameData[] = [];
  const connection = await engine.connectionFor("values");
  const view = connection.open("values", layout, {
    // Closing the engine at a test's end fails the view, which says nothing of the load.
    error: (): void => {
      frames.length = 0;
    },
    frame: (frame): void => {
      frames.push(frame);
    },
  });
  view.setViewport({ columnCount: 1, firstColumn: 0, firstRow: 0, rowCount: 5 });
  return { body, engine, frames, heard, loaded };
}

/** A dataset's status and progress, as text. */
function Progress({ source }: { readonly source: DatasetSource }): ReactNode {
  const { status, rows, progress } = useDataset("values", source);
  const read =
    progress === null ? "none" : `${String(progress.rows)} read, shown ${String(progress.shown)}`;
  return <output>{`${status}: ${String(rows)} rows; ${read}`}</output>;
}

/** A grid of the arriving stream, sorted by value, largest first. */
async function renderSorted(body: Arriving): Promise<RenderResult> {
  return render(
    <ParallaxProvider worker={startWorker}>
      <GridPage
        source={() => body.response}
        layout={{ sort: [{ column: "value", descending: true }] }}
      />
    </ParallaxProvider>,
  );
}

describe("useDataset of a first load from a response", () => {
  test("reports the rows read so far while it loads, then the rows it holds", async () => {
    const body = arriving(stream);
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Progress source={() => body.response} />
      </ParallaxProvider>,
    );
    await expect
      .element(screen.getByText("loading: null rows; 1000 read, shown true"))
      .toBeVisible();
    body.release();
    await expect.element(screen.getByText("loaded: 3000 rows; none")).toBeVisible();
  });
});

describe("a first load from a response, on the real worker", () => {
  test("opens views on its first batch, and says how many rows it expects", async () => {
    const { body, engine, frames, heard, loaded } = await loadAndOpen();
    await expect.poll(() => frames.at(-1)?.totalRows).toBe(1000);
    expect(heard[0]).toMatchObject({ estimated: true, rows: 1000, shown: true });
    // An estimate from the response's length, which counts the stream's schema and end too.
    expect(heard[0]?.expectedRows).toBeGreaterThan(2900);
    body.release();
    await expect(loaded).resolves.toStrictEqual({ dataset: "values", rows: 3000 });
    await expect.poll(() => frames.at(-1)?.totalRows).toBe(3000);
    engine.close();
  });

  test("refuses an export until it is whole", async () => {
    const { body, engine, loaded } = await loadAndOpen();
    await expect(engine.export(layout, "csv")).rejects.toThrow(
      "values is still loading; export it once it has loaded",
    );
    body.release();
    await loaded;
    await expect(engine.export(layout, "csv")).resolves.toBeInstanceOf(Blob);
    engine.close();
  });
});

describe("a grid of a first load from a response", () => {
  test("draws the rows of the first batch before the load completes, and says how many are to come", async () => {
    const body = arriving(stream);
    const screen = await renderSorted(body);
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "1000");
    await expect.element(screen.getByText("1,000 rows")).toBeVisible();
    await expect.element(screen.getByText(/^about 1,9\d\d to come$/u)).toBeVisible();
    body.release();
    await expect.element(grid).toHaveAttribute("aria-rowcount", "3000");
    await expect.element(screen.getByText("3,000 rows")).toBeVisible();
    await expect.element(screen.getByText(/to come$/u)).not.toBeInTheDocument();
  });

  test("sorts the rows so far, and sorts again as the rest arrives", async () => {
    const body = arriving(stream);
    const screen = await renderSorted(body);
    const grid = screen.getByRole("grid");
    await expect.element(grid).toHaveAttribute("aria-rowcount", "1000");
    await pressAt(grid, { x: 40, y: firstRow });
    const first = screen.getByRole("gridcell");
    await expect.element(first).toHaveTextContent("value: 999.00");
    body.release();
    await expect.element(first).toHaveTextContent("value: 2,999.00");
  });
});

/** A body that sends more than `limit` bytes at once, without saying its length, and whether it was cancelled. */
function pastLimit(limit: number): {
  readonly response: Response;
  readonly cancelled: () => boolean;
} {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel: (): void => {
      cancelled = true;
    },
    start: (controller): void => {
      controller.enqueue(stream.bytes.slice(0, limit));
      controller.enqueue(stream.bytes.slice(limit, limit + 1));
    },
  });
  return { cancelled: () => cancelled, response: new Response(body) };
}

describe("a response's body on the real worker", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, liftedLimitsKey);
  });

  test("is refused once it passes the byte limit without saying its length, and cancelled", async () => {
    Reflect.set(globalThis, liftedLimitsKey, { maxArrowBytes: stream.first, maxRows: 1_000_000 });
    const engine = new BrowserEngine(startWorker);
    const body = pastLimit(stream.first);
    await expect(engine.load("values", body.response)).rejects.toThrow(
      `values is more than the ${String(stream.first)} bytes of Arrow a table in the browser holds; have its API filter or aggregate the data to fit.`,
    );
    await expect.poll(() => body.cancelled()).toBe(true);
    await expect(engine.holds("values")).resolves.toBe(false);
    engine.close();
  });
});
