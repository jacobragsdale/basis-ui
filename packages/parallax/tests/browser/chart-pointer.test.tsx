/* What a chart's plot leaves to the page and the browser: the wheel once everything is shown, and the browser's own
 * keys and zoom; and a drag that ends without its pointerup, as when a remote desktop takes the focus. */

import "@basis/ui/styles.css";

import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import type { Layout, LayoutInput } from "#layout/layout.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { plotOf, rest, summaryOf } from "./chart-reads.ts";
import { PricesChart } from "./charts.tsx";
import { startWorker } from "./data.ts";

const line = { chart: { kind: "line", x: "date", y: ["close"] } } satisfies LayoutInput;
/** How long a chart may take to draw first: the engine's worker starts with it, which a busy host slows. */
const firstDraw = { timeout: 20_000 } as const;

/** A line chart of the prices, drawn and settled, and the layouts it has recorded. */
async function drawnLine(): Promise<{ readonly root: HTMLElement; readonly layouts: Layout[] }> {
  const layouts: Layout[] = [];
  const screen = await render(
    <ParallaxProvider worker={startWorker}>
      <PricesChart
        layout={line}
        onLayoutChange={(layout) => {
          layouts.push(layout);
        }}
      />
    </ParallaxProvider>,
  );
  await expect.poll(() => summaryOf(screen.container), firstDraw).toMatch(/points drawn$/u);
  await rest(300);
  return { layouts, root: screen.container };
}

/** Whether the chart took an event at a point of its plot from the page: whether it prevented its default. */
function taken(root: HTMLElement, event: Event): boolean {
  plotOf(root).querySelector("canvas")?.dispatchEvent(event);
  return event.defaultPrevented;
}

/** A wheel's turn over the middle of the plot. */
function wheel(root: HTMLElement, init: WheelEventInit): WheelEvent {
  const box = plotOf(root).getBoundingClientRect();
  return new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: box.left + box.width / 2,
    clientY: box.top + box.height / 2,
    ...init,
  });
}

/** A key pressed on the plot. */
function press(root: HTMLElement, init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  plotOf(root).dispatchEvent(event);
  return event.defaultPrevented;
}

/** A pointer event at `x` across the plot, with the primary button down or not. */
function pointer(root: HTMLElement, type: string, { x, down }: { x: number; down: boolean }): void {
  const box = plotOf(root).getBoundingClientRect();
  const init = {
    bubbles: true,
    buttons: down ? 1 : 0,
    cancelable: true,
    clientX: box.left + x,
    clientY: box.top + box.height / 2,
    pointerId: 1,
  };
  plotOf(root).querySelector("canvas")?.dispatchEvent(new PointerEvent(type, init));
}

/** The plot takes no real capture for the synthetic pointer these tests move. */
function withoutCapture(root: HTMLElement): void {
  const plot = plotOf(root);
  plot.setPointerCapture = (): undefined => undefined;
  plot.releasePointerCapture = (): undefined => undefined;
  plot.hasPointerCapture = (): boolean => false;
}

/** Zooms in with a key, and returns the range it recorded. */
async function zoomedIn(root: HTMLElement, layouts: readonly Layout[]): Promise<unknown> {
  press(root, { key: "+" });
  await rest(100);
  return layouts.at(-1)?.chart?.range;
}

/** Pans by dragging, then loses the pointer by `ending`; returns the range recorded then. */
async function panThenLose(
  root: HTMLElement,
  { ending, layouts }: { readonly ending: string; readonly layouts: readonly Layout[] },
): Promise<unknown> {
  pointer(root, "pointerdown", { down: true, x: 300 });
  pointer(root, "pointermove", { down: true, x: 250 });
  if (ending === "lost capture") {
    pointer(root, "lostpointercapture", { down: false, x: 250 });
  }
  pointer(root, "pointermove", { down: false, x: 200 });
  await rest(100);
  return layouts.at(-1)?.chart?.range;
}

describe("a chart's plot, among the page's controls", () => {
  test("leaves the wheel to the page once everything is shown, and Ctrl and the wheel to the browser", async () => {
    const { root } = await drawnLine();
    expect(taken(root, wheel(root, { deltaY: 100 }))).toBe(false);
    expect(taken(root, wheel(root, { ctrlKey: true, deltaY: -100 }))).toBe(false);
    expect(taken(root, wheel(root, { deltaY: -100 }))).toBe(true);
    await expect.poll(() => summaryOf(root)).toContain("zoomed in");
    // Zoomed in, the wheel zooms out again.
    expect(taken(root, wheel(root, { deltaY: 100 }))).toBe(true);
  });

  test("leaves a key with Ctrl, Cmd or Alt to the browser", async () => {
    const { root } = await drawnLine();
    expect(press(root, { ctrlKey: true, key: "+" })).toBe(false);
    expect(press(root, { ctrlKey: true, key: "0" })).toBe(false);
    expect(press(root, { altKey: true, key: "ArrowLeft" })).toBe(false);
    expect(press(root, { key: "+" })).toBe(true);
  });

  for (const ending of ["lost capture", "no button"] as const) {
    test(`ends a pan when it loses its pointer: ${ending}`, async () => {
      const { root, layouts } = await drawnLine();
      withoutCapture(root);
      const zoomed = await zoomedIn(root, layouts);
      const ended = await panThenLose(root, { ending, layouts });
      // The pan is recorded as it ends; a hover and a press's end after it pan nothing more.
      pointer(root, "pointermove", { down: false, x: 100 });
      pointer(root, "pointerup", { down: false, x: 100 });
      await rest(300);
      expect([ended === zoomed, layouts.at(-1)?.chart?.range]).toStrictEqual([false, ended]);
    });
  }
});
