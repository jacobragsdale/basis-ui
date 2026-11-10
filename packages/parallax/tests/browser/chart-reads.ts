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

/** How far apart a pixel's channels must be for it to count as coloured, rather than the greys of text and lines. */
const colouredSpread = 64;
/** The channels of a pixel, with its alpha. */
const rgba = 4;

/** The colour of the most coloured pixels of `image`, as `r,g,b`: a scatter's one dot fills more pixels with its colour
 * than anything else drawn colours. Text is coloured too where the browser draws it with subpixel antialiasing, on an
 * opaque canvas under a fontconfig that asks for it, as GitHub's Ubuntu runners have; its fringes are of many colours,
 * a few pixels each. */
function commonestColour({ width, height, data }: ImageData): string {
  const counts = new Map<string, number>();
  for (let index = 0; index < width * height; index += 1) {
    const [red = 0, green = 0, blue = 0] = data.subarray(index * rgba, index * rgba + channels);
    if (Math.max(red, green, blue) - Math.min(red, green, blue) >= colouredSpread) {
      const colour = `${String(red)},${String(green)},${String(blue)}`;
      counts.set(colour, (counts.get(colour) ?? 0) + 1);
    }
  }
  return [...counts].toSorted((first, second) => second[1] - first[1])[0]?.[0] ?? "";
}

/** The bounds of the pixels of `image` of `colour`, as `r,g,b`, in its pixels. */
function boundsOf(
  { width, height, data }: ImageData,
  colour: string,
): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} {
  const box = { bottom: 0, left: width, right: 0, top: height };
  for (let index = 0; index < width * height; index += 1) {
    if (data.subarray(index * rgba, index * rgba + channels).join(",") === colour) {
      const [x, y] = [index % width, Math.floor(index / width)];
      Object.assign(box, {
        bottom: Math.max(box.bottom, y),
        left: Math.min(box.left, x),
        right: Math.max(box.right, x),
        top: Math.min(box.top, y),
      });
    }
  }
  return box;
}

/** The middle of the canvas's commonest colour, such as a scatter's one dot, from the plot's top-left corner; the
 * plot's middle is not the dot's, since the axes' labels take room on one side. */
function colouredMiddleOf(root: HTMLElement): { readonly x: number; readonly y: number } {
  const canvas = root.querySelector("canvas");
  const context = canvas?.getContext("2d");
  if (canvas === null || context === null || context === undefined) {
    throw new Error("the chart has no canvas");
  }
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const box = boundsOf(image, commonestColour(image));
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  return { x: (box.left + box.right) / 2 / scale, y: (box.top + box.bottom) / 2 / scale };
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

export { colouredMiddleOf, fire, plotOf, rest, summaryOf, surfaceOf, wordsOf };
