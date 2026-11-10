/* The status bar's "as of" on a real grid and pivot: the date the page gives, or else when the source was read and how
 * long ago, and nothing when the source gave no time, never the time the browser loaded the table. */

import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";
import type { ReactNode } from "react";
import type { RenderResult } from "vitest-browser-react";

import { Grid } from "#grid/grid.tsx";
import type { LayoutInput } from "#layout/layout.ts";
import { Pivot } from "#pivot/pivot.tsx";
import { ParallaxProvider } from "#react/provider.tsx";
import { useDataset } from "#react/use-dataset.ts";

import { byFund, positionsBytes, startWorker } from "./data.ts";

const microsPerMilli = 1000;
const tenMinutesMs = 600_000;

/** The positions in a grid, or in a pivot, read from their source at `readAt` when given, dated `asOf` when given. */
function StatusPage({
  readAt,
  asOf,
  pivot = false,
}: {
  readonly readAt?: number;
  readonly asOf?: string;
  readonly pivot?: boolean;
}): ReactNode {
  const positions = useDataset(
    "positions",
    positionsBytes,
    readAt === undefined ? {} : { sourceAsOfMicros: readAt * microsPerMilli },
  );
  const layout: LayoutInput = {};
  return (
    <div className="h-96 w-full max-w-5xl">
      {pivot ? (
        <Pivot dataset={positions} layout={byFund} asOf={asOf} />
      ) : (
        <Grid dataset={positions} layout={layout} asOf={asOf} />
      )}
    </div>
  );
}

/** Renders the page, waiting for the grid's rows. */
async function renderStatus(props: Parameters<typeof StatusPage>[0]): Promise<RenderResult> {
  const screen = await render(
    <ParallaxProvider worker={startWorker}>
      <StatusPage {...props} />
    </ParallaxProvider>,
  );
  await expect.element(screen.getByRole("grid")).not.toHaveAttribute("aria-rowcount", "0");
  return screen;
}

/** The bar's "as of", or null when it shows none. */
function asOfShown(screen: RenderResult): string | null {
  return (
    screen.container.querySelector('[data-slot="grid-status-age"]')?.textContent.trim() ?? null
  );
}

/** About this data's text, opened from the bar. */
async function aboutText(screen: RenderResult): Promise<string> {
  await screen.getByRole("button", { name: "About this data" }).click();
  const about = screen.getByRole("dialog", { name: "About this data" });
  await expect.element(about).toBeVisible();
  return about.element().textContent;
}

describe("the status bar's as of", () => {
  test("shows none when the source gave no time, and About this data keeps the time the table loaded", async () => {
    const screen = await renderStatus({});
    await expect.element(screen.getByText("6 rows")).toBeVisible();
    expect(asOfShown(screen)).toBeNull();
    const about = await aboutText(screen);
    expect(about).toMatch(/Loaded at\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} New York/u);
    expect(about).toMatch(/Source read at\s*unknown/u);
  });

  test("shows the source's time and its age when the page gives no date", async () => {
    const screen = await renderStatus({ readAt: Date.now() - tenMinutesMs });
    await expect
      .poll(() => asOfShown(screen))
      .toMatch(/^as of \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} · 10 min ago$/u);
  });

  test("shows the date the page gives alone, and About this data keeps the source's time", async () => {
    const screen = await renderStatus({ asOf: "2026-11-06", readAt: Date.now() - tenMinutesMs });
    await expect.poll(() => asOfShown(screen)).toBe("as of 2026-11-06");
    expect(await aboutText(screen)).toMatch(
      /Source read at\s*\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/u,
    );
  });

  test("shows why in place of a date that is not one, and the grid still shows its rows", async () => {
    const screen = await renderStatus({ asOf: "2026-02-30" });
    await expect.element(screen.getByText("6 rows")).toBeVisible();
    expect(
      screen.container.querySelector('[data-slot="grid-status-as-of-error"]')?.textContent,
    ).toMatch(/^ERROR asOf "2026-02-30" is no day of the calendar: pass the date/u);
    expect(asOfShown(screen)).toBeNull();
  });

  test("shows the date a pivot is given under its table", async () => {
    const screen = await renderStatus({ asOf: "2026-11-06", pivot: true });
    await expect.poll(() => asOfShown(screen)).toBe("as of 2026-11-06");
  });
});
