/* What the chart's browser tests read off a chart, and how they move the pointer over it: its plot, its status line's
 * summary, its text alternative, its canvas's surface, and pointer, mouse and wheel events at a point of its plot. */

/** The channels of a pixel's colour, without its alpha. */
const channels = 3;

/** The chart's plot, which takes the pointer, the wheel and the keys. */
function plotOf(root: HTMLElement): HTMLElement {
  const plot = root.querySelector<HTMLElement>('[data-slot="chart-plot"]');
  if (plot === null) {
    throw new Error("the chart has no plot");
  }
  return plot;
}

/** What the chart's status line says it draws. */
function summaryOf(root: HTMLElement): string {
  return root.querySelector('[data-slot="chart-summary"]')?.textContent ?? "";
}

/** The chart's text alternative, which describes its plot. */
function wordsOf(root: HTMLElement): string {
  const id = plotOf(root).getAttribute("aria-describedby") ?? "";
  return root.ownerDocument.querySelector(`#${CSS.escape(id)}`)?.textContent ?? "";
}

/** The canvas's pixel at its top-left corner, the surface, as `r,g,b`. */
function surfaceOf(root: HTMLElement): string {
  const pixel = root.querySelector("canvas")?.getContext("2d")?.getImageData(0, 0, 1, 1).data;
  return pixel === undefined ? "" : pixel.slice(0, channels).join(",");
}

/** A point of the plot, from its top-left corner, and how far the wheel turns there. */
interface At {
  readonly x: number;
  readonly y: number;
  readonly deltaY?: number;
}

/** An event of `type` at a point of the page. */
function eventOf(type: string, init: MouseEventInit, deltaY: number): Event {
  if (type === "wheel") {
    return new WheelEvent(type, { ...init, deltaY });
  }
  return type.startsWith("pointer") ? new PointerEvent(type, init) : new MouseEvent(type, init);
}

/** Fires a pointer, mouse or wheel event of `type` at a point of the plot. */
function fire(root: HTMLElement, type: string, at: At): void {
  const plot = plotOf(root);
  const box = plot.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    clientX: box.left + at.x,
    clientY: box.top + at.y,
  };
  plot.querySelector("canvas")?.dispatchEvent(eventOf(type, init, at.deltaY ?? 0));
}

/** Resolves after `ms` milliseconds, once what React rendered meanwhile is done. */
async function rest(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  setTimeout(resolve, ms);
  return promise;
}

export { fire, plotOf, rest, summaryOf, surfaceOf, wordsOf };
