/* The grid's drawing against the browser's animation frames: however many events arrive in a frame, it paints once; a
 * notch of the wheel moves a whole number of rows at once rather than the browser's pixels; and a hidden tab, which
 * runs no frames, draws what it should once shown. */

import "@basis/ui/styles.css";

import { createRef } from "react";
import { expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import type { GridHandle } from "#grid/use-grid-handles.ts";
import { ParallaxProvider } from "#react/provider.tsx";

import { countedBytes, startWorker } from "./data.ts";
import { canvasOf } from "./grid-helpers.tsx";
import { GridPage } from "./grid-page.tsx";

/** The compact density's rows, the default: a medium control's 28 px, under a large control's 30 px header. */
const rowPx = 28;
const headerPx = 30;
/** How many frames a test watches after the wheel, longer than any smooth scroll of a notch animates. */
const watchedFrames = 30;
/** A notch of a mouse's wheel, as Chromium gives it: 100 pixels. */
const notch = { delta: { y: 100 } };
const manyRows = 30_000;
const farRow = 5000;
/** How long a hidden tab waits for the engine's rows, which arrive without a frame. */
const hiddenMs = 500;

/** Waits for the page's next animation frame. */
async function nextFrame(): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<number>();
  requestAnimationFrame(resolve);
  return promise;
}

async function frames(count = 2): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- frames come one after another.
    await nextFrame();
  }
}

/** Waits for a task of its own, as an input event or a message from the engine arrives, without a timer's clamp. */
async function nextTask(): Promise<void> {
  const { port1, port2 } = new MessageChannel();
  const { promise, resolve } = Promise.withResolvers<MessageEvent>();
  port1.addEventListener("message", resolve);
  port1.start();
  port2.postMessage(null);
  await promise;
  port1.close();
}

async function pause(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  setTimeout(resolve, ms, undefined);
  return promise;
}

interface Shown {
  readonly grid: Locator;
  readonly scroll: HTMLElement;
  /** How many times the grid has drawn its rows. */
  readonly drawn: () => number;
}

function elementOf(grid: Locator): HTMLElement {
  const element = grid.element();
  if (!(element instanceof HTMLElement)) {
    throw new TypeError("The grid is not an HTML element.");
  }
  return element;
}

/** Renders a grid of `rows` rows and waits for them to be drawn, with the pointer resting over it. */
async function showRows(rows: number): Promise<Shown> {
  const ref = createRef<GridHandle>();
  const screen = await render(
    <ParallaxProvider worker={startWorker}>
      <GridPage source={() => countedBytes(rows)} gridRef={ref} />
    </ParallaxProvider>,
  );
  const grid = screen.getByRole("grid");
  await expect.element(grid).toHaveAttribute("aria-rowcount", String(rows));
  const drawn = (): number => ref.current?.drawStats().frames ?? 0;
  await expect.poll(drawn).toBeGreaterThan(0);
  // The pointer rests over the grid, where the wheel turns, so that its hover is drawn before a test counts.
  await userEvent.hover(grid);
  await frames();
  return { drawn, grid, scroll: elementOf(grid) };
}

/** Moves the pointer over each of the first `count` rows, each move in a task of its own, all before the next frame;
 * returns how many frames began meanwhile. */
async function moveOverRows(canvas: HTMLCanvasElement, count: number): Promise<number> {
  const box = canvas.getBoundingClientRect();
  let began = 0;
  await nextFrame();
  requestAnimationFrame(() => {
    began += 1;
  });
  for (let row = 0; row < count; row += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each event arrives in a task of its own.
    await nextTask();
    const clientY = box.top + headerPx + row * rowPx + rowPx / 2;
    canvas.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: box.left + 40, clientY }),
    );
  }
  return began;
}

test("paints once in a frame however many events arrive in it", async () => {
  const { grid, drawn } = await showRows(100);
  const before = drawn();
  // Six moves, each over another row, so that each changes what the canvas shows.
  expect(await moveOverRows(canvasOf(grid), 6)).toBe(0);
  // All six arrived before the frame, which has not painted yet.
  expect(drawn() - before).toBe(0);
  await frames();
  expect(drawn() - before).toBe(1);
});

/** The scroll's offset in each of the frames after `act`, and how many times the grid drew in them. */
async function watch(
  { scroll, drawn }: Shown,
  act: () => Promise<void>,
): Promise<{ readonly tops: ReadonlySet<number>; readonly last: number; readonly draws: number }> {
  const before = drawn();
  await act();
  const tops: number[] = [];
  for (let frame = 0; frame < watchedFrames; frame += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one sample a frame.
    await nextFrame();
    tops.push(scroll.scrollTop);
  }
  return { draws: drawn() - before, last: scroll.scrollTop, tops: new Set(tops) };
}

test("moves three rows at once for a notch of the wheel, and paints them once", async () => {
  const shown = await showRows(manyRows);
  const wheel = async (options: Parameters<typeof userEvent.wheel>[1]): Promise<void> =>
    userEvent.wheel(shown.scroll, options);
  // The browser's own scroll moves the notch's 100 pixels, four rows and a sixth, and where smooth scrolling is on, as
  // on a Windows desktop, animates them over several frames, each painted. Playwright's wheel is never animated.
  const down = await watch(shown, async () => wheel(notch));
  expect(down.tops).toEqual(new Set([3 * rowPx]));
  expect(down.draws).toBe(1);
  const twice = await watch(shown, async () => wheel({ ...notch, times: 2 }));
  expect(twice.last).toBe(9 * rowPx);
  expect(twice.draws).toBeLessThanOrEqual(2);
  const up = await watch(shown, async () => wheel({ delta: { y: -100 } }));
  expect(up.tops).toEqual(new Set([6 * rowPx]));
});

/** Scrolls to `top` and waits until it is drawn. */
async function scrollTo(scroll: HTMLElement, top: number): Promise<void> {
  scroll.scrollTop = top;
  await frames();
}

/** Whether the wheel's event reached the scroll's parent cancelled, as the page sees it. */
async function wheelReachesPage(scroll: HTMLElement, deltaY: number): Promise<boolean> {
  const seen: boolean[] = [];
  const listener = (event: Event): void => {
    seen.push(event.defaultPrevented);
  };
  scroll.parentElement?.addEventListener("wheel", listener);
  await userEvent.wheel(scroll, { delta: { y: deltaY } });
  scroll.parentElement?.removeEventListener("wheel", listener);
  return seen.length === 1 && seen[0] === false;
}

test("lands a notch on a whole row from part of one, and leaves the top's wheel to the page", async () => {
  const shown = await showRows(manyRows);
  const { scroll } = shown;
  await scrollTo(scroll, rowPx + 10);
  const { last } = await watch(shown, async () => userEvent.wheel(scroll, notch));
  expect(last).toBe(4 * rowPx);
  await scrollTo(scroll, 0);
  expect(await wheelReachesPage(scroll, -100)).toBe(true);
  expect(scroll.scrollTop).toBe(0);
});

test("leaves a trackpad's small deltas to the browser, which scrolls them by the pixel", async () => {
  const shown = await showRows(manyRows);
  const { last } = await watch(shown, async () =>
    userEvent.wheel(shown.scroll, { delta: { y: 4 }, times: 3 }),
  );
  expect(last).toBe(12);
});

/** What the canvas shows once it stops changing. */
async function settled(canvas: HTMLCanvasElement): Promise<string> {
  await vi.waitFor(async () => {
    const was = canvas.toDataURL();
    await frames(10);
    expect(canvas.toDataURL()).toBe(was);
  });
  return canvas.toDataURL();
}

/** Holds the animation frames asked for, as a hidden tab does; returns a function that shows the tab, running them. */
function hide(): () => void {
  const held: FrameRequestCallback[] = [];
  const spy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((step) => {
    held.push(step);
    return held.length;
  });
  return () => {
    spy.mockRestore();
    const now = performance.now();
    for (const step of held.splice(0)) {
      step(now);
    }
  };
}

/** The picture of row 5,000 at the top, drawn as a visible tab draws it; the grid is left at the top again. */
async function farPicture(scroll: HTMLElement, canvas: HTMLCanvasElement): Promise<string> {
  scroll.scrollTop = farRow * rowPx;
  const far = await settled(canvas);
  scroll.scrollTop = 0;
  expect(await settled(canvas)).not.toBe(far);
  return far;
}

/** Scrolls to row 5,000 and waits for the engine's rows, which arrive whether frames run or not. */
async function scrollWithoutFrames(scroll: HTMLElement): Promise<void> {
  scroll.scrollTop = farRow * rowPx;
  await pause(hiddenMs);
}

test("draws in a hidden tab's first frame what changed while it ran none", async () => {
  const { scroll, grid, drawn } = await showRows(manyRows);
  const canvas = canvasOf(grid);
  const expected = await farPicture(scroll, canvas);
  // Hidden: animation frames wait, while the scroll and the engine's rows still arrive.
  const show = hide();
  const before = drawn();
  await scrollWithoutFrames(scroll);
  expect(drawn()).toBe(before);
  // Shown: the frames that waited run, and the canvas shows row 5,000 as if it had never been hidden.
  show();
  await frames();
  expect([drawn() - before, canvas.toDataURL() === expected]).toEqual([1, true]);
});
