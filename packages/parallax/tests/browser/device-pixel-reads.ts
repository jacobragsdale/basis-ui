/* What the device-pixel tests read off a canvas: its box in device pixels, the colours of a column of its pixels and
 * the colours that fill whole ones, where a chart's bars leave a gap, how a line of text inks each row, and media
 * queries that change when asked. */

import { vi } from "vite-plus/test";

import type { Theme } from "#theme/read.ts";

/** A pixel's channels with its alpha, and without. */
const rgba = 4;
const channels = 3;

/** The size the browser says `canvas`'s box covers in device pixels. */
async function deviceBox(canvas: HTMLCanvasElement): Promise<readonly [number, number]> {
  const { promise, resolve } = Promise.withResolvers<readonly [number, number]>();
  const observer = new ResizeObserver(([entry]) => {
    observer.disconnect();
    const [box] = entry?.devicePixelContentBoxSize ?? [];
    resolve([box?.inlineSize ?? 0, box?.blockSize ?? 0]);
  });
  observer.observe(canvas, { box: "device-pixel-content-box" });
  return promise;
}

/** `color` drawn over `under` on an opaque canvas, as `r,g,b`. */
function painted(color: string, under: string): string {
  const context = document.createElement("canvas").getContext("2d", { alpha: false });
  if (context === null) {
    throw new Error("No 2D context.");
  }
  for (const fill of [under, color]) {
    context.fillStyle = fill;
    context.fillRect(0, 0, 1, 1);
  }
  return context.getImageData(0, 0, 1, 1).data.slice(0, channels).join(",");
}

/** Every colour a canvas fills whole device pixels with, as `r,g,b`: each surface, each line drawn over one, and
 * each line drawn over another where two cross. A pixel a rule half covers is a blend of the two, and none of these. */
function fills(
  theme: Theme,
  surfaces: readonly (keyof Theme)[],
  lines: readonly (keyof Theme)[],
): ReadonlySet<string> {
  const colours = new Set<string>();
  for (const surface of surfaces.map((name) => String(theme[name]))) {
    colours.add(painted(surface, surface));
    for (const line of lines.map((name) => String(theme[name]))) {
      const once = painted(line, surface);
      colours.add(once);
      for (const top of lines.map((name) => String(theme[name]))) {
        colours.add(painted(top, `rgb(${once})`));
      }
    }
  }
  return colours;
}

/** The colours of one column of the canvas's device pixels, from row `from` to row `to`, as `r,g,b`. */
function strip(
  canvas: HTMLCanvasElement,
  x: number,
  [from, to]: readonly [number, number],
): readonly string[] {
  const data =
    canvas.getContext("2d")?.getImageData(x, from, 1, to - from).data ?? new Uint8ClampedArray();
  return Array.from({ length: data.length / rgba }, (_pixel, index) =>
    data.slice(index * rgba, index * rgba + channels).join(","),
  );
}

/** The device pixels thick a rule one CSS pixel thick is: whole, at least one, rounded down as a CSS border is. */
function ruleThickness(): number {
  return Math.max(1, Math.floor(globalThis.devicePixelRatio));
}

/** How far apart a pixel's channels must be for it to count as a bar's, rather than the greys of text and lines. */
const colouredSpread = 64;

/** Which of the canvas's device pixels are coloured, as a bar's are, by row and column. */
function colouredPixels(canvas: HTMLCanvasElement): (x: number, y: number) => boolean {
  const { width, height } = canvas;
  const image = canvas.getContext("2d")?.getImageData(0, 0, width, height).data;
  return (x, y) => {
    const at = (y * width + x) * rgba;
    const [red = 0, green = 0, blue = 0] = image?.subarray(at, at + channels) ?? [];
    return Math.max(red, green, blue) - Math.min(red, green, blue) >= colouredSpread;
  };
}

/** The runs of `count` indices that `inside` holds for, as `[first, last]`. */
function runsOf(
  count: number,
  inside: (index: number) => boolean,
): readonly (readonly [number, number])[] {
  const runs: [number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    const last = runs.at(-1);
    if (inside(index) && last?.[1] === index - 1) {
      last[1] = index;
    } else if (inside(index)) {
      runs.push([index, index]);
    }
  }
  return runs;
}

/** A column of device pixels between the chart's first two bars, and a row a little below the bars' bottom, past the
 * baseline but above the x axis's labels: down to it, the column crosses the gridlines and the baseline only. */
function gapBetweenBars(canvas: HTMLCanvasElement): readonly [number, number] {
  const coloured = colouredPixels(canvas);
  const { width, height } = canvas;
  const columns = runsOf(width, (x) =>
    Array.from({ length: height }, (_row, y) => y).some((y) => coloured(x, y)),
  );
  const rows = runsOf(height, (y) =>
    Array.from({ length: width }, (_column, x) => x).some((x) => coloured(x, y)),
  );
  const [first, second] = columns;
  const bottom = rows.at(-1)?.[1];
  if (first === undefined || second === undefined || bottom === undefined) {
    throw new Error("The chart drew fewer than two bars.");
  }
  return [
    Math.round((first[1] + second[0]) / 2),
    bottom + Math.ceil(2 * globalThis.devicePixelRatio),
  ];
}

/** A line of text drawn in white at `y` CSS pixels, at the page's ratio, on an opaque canvas, which starts black. */
function textAt(y: number): CanvasRenderingContext2D {
  const ratio = globalThis.devicePixelRatio;
  const canvas = document.createElement("canvas");
  Object.assign(canvas, { height: 40, width: 120 });
  const context = canvas.getContext("2d", { alpha: false });
  if (context === null) {
    throw new Error("No 2D context.");
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  Object.assign(context, { fillStyle: "#fff", font: "12px sans-serif", textBaseline: "middle" });
  context.fillText("Hg 1,234.50", 2, y);
  return context;
}

/** How much ink each device row of a line of text holds, drawn at `y` CSS pixels at the page's ratio. */
function inkByRow(y: number): readonly number[] {
  const context = textAt(y);
  const { canvas } = context;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return Array.from({ length: canvas.height }, (_row, row) =>
    Array.from(
      { length: canvas.width },
      (_column, column) => data[(row * canvas.width + column) * rgba] ?? 0,
    ).reduce((sum, ink) => sum + ink, 0),
  );
}

/** Media queries that never match on their own: the queries asked, and their listeners, to call as a change would. */
function heardQueries(): {
  readonly asked: () => readonly string[];
  readonly listeners: readonly (() => void)[];
} {
  const query = globalThis.matchMedia("(min-width: 0px)");
  const listeners: (() => void)[] = [];
  vi.spyOn(query, "addEventListener").mockImplementation((_type, listener) => {
    listeners.push(() => {
      if (typeof listener === "function") {
        listener(new Event("change"));
      }
    });
  });
  const spy = vi.spyOn(globalThis, "matchMedia").mockReturnValue(query);
  return { asked: () => spy.mock.calls.map(([asked]) => asked), listeners };
}

export { deviceBox, fills, gapBetweenBars, heardQueries, inkByRow, painted, ruleThickness, strip };
