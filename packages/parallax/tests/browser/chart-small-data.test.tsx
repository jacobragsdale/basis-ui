import "@basis/ui/styles.css";

import { useState } from "react";
import type { ReactNode } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { Chart } from "#chart/chart.tsx";
import type { ToWorker } from "#engine/messages.ts";
import type { WorkerPort } from "#engine/port.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { rest, summaryOf } from "./chart-reads.ts";
import { exposures } from "./chart-data.ts";
import { startWorker } from "./data.ts";

/** How long a chart may take to draw first: the engine's worker starts with it, which a busy host slows. */
const firstDraw = { timeout: 20_000 } as const;

/** Every summary a chart's status line shows, in order, from now on. */
function summariesOf(root: HTMLElement): () => readonly string[] {
  const seen: string[] = [];
  const observer = new MutationObserver(() => {
    const now = summaryOf(root);
    if (seen.at(-1) !== now) {
      seen.push(now);
    }
  });
  observer.observe(root, { characterData: true, childList: true, subtree: true });
  return () => seen;
}

/** The real worker, counting the tables the page asks it to load. */
function countingWorker(): { readonly start: () => WorkerPort; readonly loads: () => number } {
  let loads = 0;
  return {
    loads: () => loads,
    start: (): WorkerPort => {
      const worker = startWorker();
      return {
        addEventListener: (type, listener): void => {
          worker.addEventListener(type, listener);
        },
        postMessage: (message: ToWorker, options): void => {
          loads += message.kind === "load" ? 1 : 0;
          worker.postMessage(message, options);
        },
        terminate: (): void => {
          worker.terminate();
        },
      };
    },
  };
}

/** The problem a chart shows in place of its plot. */
function alertOf(root: HTMLElement): string {
  return root.querySelector('[role="alert"]')?.textContent ?? "";
}

describe("Chart's small-data form, as its docs show it", () => {
  test("draws the catalogue's example: a curve of text tenors on a tenor axis", async () => {
    // `Chart`'s @example, in src/chart/chart.tsx.
    const curve = [
      { tenor: "2Y", yield: 0.0412 },
      { tenor: "10Y", yield: 0.0438 },
    ];
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <div className="h-80 w-160">
          <Chart
            rows={curve}
            kind="line"
            x="tenor"
            y="yield"
            settings={{ axis: "tenor" }}
            name="Treasury yields"
          />
        </div>
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container), firstDraw).toBe("2 points drawn");
  });

  test("says what to change for text on a value axis, rather than the engine's refusal", async () => {
    const errors: (string | null)[] = [];
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart
          rows={[{ tenor: "2Y", yield: 0.0412 }]}
          kind="line"
          x="tenor"
          y="yield"
          className="h-80 w-160"
          onError={(error) => {
            errors.push(error);
          }}
        />
      </ParallaxProvider>,
    );
    await expect.poll(() => alertOf(screen.container), firstDraw).toMatch(/axis: "tenor"/u);
    expect(errors.at(-1)).toMatch(/^Column tenor holds text/u);
  });

  test("draws the README's example, the rows' bars in their order", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart rows={exposures} kind="bar" x="sector" y="exposure" className="h-80 w-160" />
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container), firstDraw).toBe("3 groups");
  });
});

/** Three days of P&L, the days as text. */
const days = [
  { day: "2026-11-10", pnl: 2 },
  { day: "2026-11-11", pnl: -1 },
  { day: "2026-11-12", pnl: 3 },
];

describe("Chart's small-data form, over dates written as text", () => {
  for (const kind of ["waterfall", "bar", "scatter", "area"] as const) {
    test(`draws them as dates on a ${kind} chart`, async () => {
      const screen = await render(
        <ParallaxProvider worker={startWorker}>
          <Chart rows={days} kind={kind} x="day" y="pnl" className="h-80 w-160" />
        </ParallaxProvider>,
      );
      await expect.poll(() => summaryOf(screen.container), firstDraw).toMatch(/^3 /u);
      expect(alertOf(screen.container)).toBe("");
    });
  }
});

/** A row as an API types it: an optional field, and a nested one the chart does not plot. */
interface ApiRow {
  readonly sector: string;
  readonly exposure?: number;
  readonly desk: { readonly name: string };
}

describe("Chart's small-data form, over rows it cannot type", () => {
  test("takes an API's typed rows, reading only the columns it plots", async () => {
    const rows: readonly ApiRow[] = [
      { desk: { name: "Atlas" }, exposure: 3, sector: "Rates" },
      { desk: { name: "Atlas" }, sector: "Credit" },
    ];
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart rows={rows} kind="bar" x="sector" y="exposure" className="h-80 w-160" />
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container), firstDraw).toBe("2 groups");
  });

  test("shows a column of numbers and text as its own problem, and renders on", async () => {
    const errors: (string | null)[] = [];
    const rows = [
      { exposure: 3, sector: "Rates" },
      { exposure: "N/A", sector: "Credit" },
    ];
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart
          rows={rows}
          kind="bar"
          x="sector"
          y="exposure"
          className="h-80 w-160"
          onError={(error) => {
            errors.push(error);
          }}
        />
      </ParallaxProvider>,
    );
    await expect
      .poll(() => alertOf(screen.container), firstDraw)
      .toBe(
        'Column exposure mixes kinds of value, such as "N/A" in row 2: give each of a chart\'s columns one kind, and null where a row has none',
      );
    expect(errors).toHaveLength(1);
  });

  test("shows a date that is no day as its own problem", async () => {
    const screen = await render(
      <ParallaxProvider worker={startWorker}>
        <Chart
          rows={[...days, { day: "2026-02-30", pnl: 1 }]}
          kind="line"
          x="day"
          y="pnl"
          className="h-80 w-160"
        />
      </ParallaxProvider>,
    );
    await expect
      .poll(() => alertOf(screen.container), firstDraw)
      .toMatch(/^Column day holds "2026-02-30" in row 4, which is not a day/u);
  });
});

/** A page that builds its chart's rows afresh each time it renders, which a press makes it do. */
function Rebuilding(): ReactNode {
  const [renders, setRenders] = useState(0);
  const rows = structuredClone(exposures);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRenders(renders + 1);
        }}
      >
        Render {renders}
      </button>
      <Chart rows={rows} kind="bar" x="sector" y="exposure" className="h-80 w-160" />
    </>
  );
}

/** Small multiples: more charts than the 64 tables a cache once kept, each of its own rows. */
const multiples = 70;

describe("Chart's small-data form, on a busy page", () => {
  test("keeps its table while a page builds the same rows afresh, loading them once", async () => {
    const counted = countingWorker();
    const screen = await render(
      <ParallaxProvider worker={counted.start}>
        <Rebuilding />
      </ParallaxProvider>,
    );
    await expect.poll(() => summaryOf(screen.container), firstDraw).toBe("3 groups");
    const seen = summariesOf(screen.container);
    for (let press = 0; press < 3; press += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each render settles before the next.
      await screen.getByRole("button", { name: /^Render/u }).click();
    }
    await expect
      .element(screen.getByRole("button", { name: /^Render/u }))
      .toHaveTextContent("Render 3");
    await rest(300);
    expect([
      seen().includes("loading…"),
      summaryOf(screen.container),
      counted.loads(),
    ]).toStrictEqual([false, "3 groups", 1]);
  });

  test("draws more small charts than a shared cache once held, and each settles", async () => {
    const counted = countingWorker();
    const screen = await render(
      <ParallaxProvider worker={counted.start}>
        {Array.from({ length: multiples }, (_entry, chart) => (
          <Chart
            key={chart}
            rows={[{ exposure: chart + 1, sector: "Rates" }]}
            kind="bar"
            x="sector"
            y="exposure"
            className="h-32 w-40"
          />
        ))}
      </ParallaxProvider>,
    );
    const summaries = (): readonly string[] =>
      [...screen.container.querySelectorAll('[data-slot="chart-summary"]')].map(
        (summary) => summary.textContent,
      );
    await expect
      .poll(() => summaries().filter((summary) => summary === "1 groups").length, firstDraw)
      .toBe(multiples);
    await rest(500);
    // One load each: none loads again for a cache another chart filled.
    expect(counted.loads()).toBe(multiples);
  });
});
