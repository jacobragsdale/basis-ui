/* A grid of more rows than a scroll can hold one by one, whose scroll maps to its rows by a fraction, at the ratio of
 * each browser project: 1, and the 1.25 and 1.5 of Windows' scaling. Down the whole scrollbar, the row a click reports
 * is the row drawn where it clicked. */

import "@basis/ui/styles.css";

import type { ReactNode } from "react";
import { afterEach, expect, onTestFinished, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { Grid } from "#grid/grid.tsx";
import type { GridCell } from "#grid/events.ts";
import { metricsOf } from "#grid/paint/metrics.ts";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";
import { readTheme } from "#theme/read.ts";

import { countedBytes, startWorker } from "./data.ts";

/** Past the 1,000,000 rows whose scroll is drawn one pixel a row at most. */
const rows = 1_200_000;
const positions = 24;

afterEach(() => {
  vi.restoreAllMocks();
});

/** A grid of `rows` rows numbered from 0. */
function Numbered({ clicked }: { readonly clicked: GridCell[] }): ReactNode {
  const values = useDataset("values", () => countedBytes(rows));
  return (
    <Grid
      dataset={values}
      layout={{ column_widths: { value: 200 } }}
      toolbar={false}
      onCellClick={(cell) => {
        clicked.push(cell);
      }}
    />
  );
}

/** A box 383 CSS pixels tall, a fraction of a device pixel at 1.25 and 1.5. */
function fractionalBox(): HTMLElement {
  const box = document.createElement("div");
  Object.assign(box.style, { height: "383px", width: "400px" });
  document.body.append(box);
  onTestFinished(() => {
    box.remove();
  });
  return box;
}

type FillText = CanvasRenderingContext2D["fillText"];

/** The text drawn last, in the calls `fillText` recorded, whose middle is within half a row of `y`. */
function drawnAt(calls: readonly Parameters<FillText>[], y: number, rowPx: number): string | null {
  const near = calls.findLast(([text, , at]) => Math.abs(at - y) < rowPx / 2 && /\d/u.test(text));
  return near?.[0] ?? null;
}

/** The grid, shown, its rows numbered from 0, and where its third body row is, which lies across a fraction of a
 * device pixel at either ratio. */
async function shown(clicked: GridCell[]): Promise<{
  readonly scroll: HTMLElement;
  readonly y: number;
  readonly rowPx: number;
}> {
  const screen = await render(
    <ParallaxProvider worker={startWorker}>
      <Numbered clicked={clicked} />
    </ParallaxProvider>,
    { container: fractionalBox() },
  );
  const grid = screen.getByRole("grid");
  await expect.element(grid).toHaveAttribute("aria-rowcount", String(rows));
  const scroll = grid.element();
  if (!(scroll instanceof HTMLElement)) {
    throw new TypeError("The grid is not an element.");
  }
  const { rowPx, headerPx } = metricsOf(readTheme(scroll));
  return { rowPx, scroll, y: headerPx + 2.5 * rowPx };
}

/** Scrolls to `top`, unless it is `null`, waits for the row at `y` to be drawn, clicks it, and says how the row drawn
 * and the row clicked differ, if they do. */
async function clickAt(
  at: { readonly scroll: HTMLElement; readonly y: number; readonly rowPx: number },
  top: number | null,
  {
    fillText,
    clicked,
  }: {
    readonly fillText: {
      readonly mock: { readonly calls: Parameters<FillText>[] };
      readonly mockClear: () => unknown;
    };
    readonly clicked: readonly GridCell[];
  },
): Promise<string | null> {
  const { scroll, y, rowPx } = at;
  if (top !== null) {
    fillText.mockClear();
    scroll.scrollTop = top;
  }
  await expect.poll(() => drawnAt(fillText.mock.calls, y, rowPx)).not.toBeNull();
  const drawn = drawnAt(fillText.mock.calls, y, rowPx);
  await userEvent.click(scroll, { position: { x: 60, y } });
  const reported = clicked.at(-1)?.text;
  return reported === drawn
    ? null
    : `at ${String(scroll.scrollTop)}: drawn ${String(drawn)}, clicked ${String(reported)}`;
}

/** How the rows drawn and clicked differ at each of `positions` steps down the scrollbar, and at its top. */
async function mismatchesDown(
  at: Parameters<typeof clickAt>[0],
  recorded: Parameters<typeof clickAt>[2],
  step = 0,
): Promise<string[]> {
  if (step > positions) {
    return [];
  }
  const range = at.scroll.scrollHeight - at.scroll.clientHeight;
  // A scroll that moves draws again; the top is where the grid is already drawn.
  const mismatch = await clickAt(at, step === 0 ? null : (range * step) / positions, recorded);
  const rest = await mismatchesDown(at, recorded, step + 1);
  return mismatch === null ? rest : [mismatch, ...rest];
}

test("a click anywhere down the scrollbar reports the row drawn under it", async () => {
  const fillText = vi.spyOn(CanvasRenderingContext2D.prototype, "fillText");
  const clicked: GridCell[] = [];
  const at = await shown(clicked);
  await expect(mismatchesDown(at, { clicked, fillText })).resolves.toStrictEqual([]);
  // At the scroll's end the last row shows whole.
  expect(fillText.mock.calls.map(([text]) => text)).toContain("1,199,999.00");
});
