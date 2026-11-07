/* How the parity spec compares a React chart's canvas with the Angular demo's screenshot of the same chart: the React
 * card is sized until its canvas is exactly the Angular canvas's size, and the canvas's pixels are compared with the
 * screenshot's at the Angular canvas's place. The Angular demo's screenshots are kept in `angular/` since roadmap step
 * 2.7 deleted the Angular layer, so the comparison guards the React canvases against drifting from them. */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

import angularCanvases from "./angular-canvases.json" with { type: "json" };

/** A canvas's place in its section's screenshot, and its size, in CSS pixels at a pixel ratio of 1. */
interface CanvasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How a React canvas compares with the Angular screenshot's. */
interface Comparison {
  /** Pixels whose colour differs in any channel. */
  readonly differing: number;
  /** The first of them, as `x, y`, or null when none differ. */
  readonly first: readonly [number, number] | null;
}

const screenshots = path.join(import.meta.dirname, "angular");
/** How long a size must hold to count as steady, and how long a canvas must read the same to count as drawn. */
const steadyMs = 150;
const settleMs = 300;
/** How many times a card is resized before its plot must have reached the size. */
const fitTries = 10;

/** The Angular canvas's place in the screenshot named `name`, without its mode. */
function angularRect(name: string): CanvasRect {
  const rect = Object.entries(angularCanvases).find(([key]) => key === name)?.[1];
  if (rect === undefined) {
    throw new Error(`angular-canvases.json has no canvas for ${name}.`);
  }
  return rect;
}

/** The size of the plot in `section`, in CSS pixels. */
async function plotSize(section: Locator): Promise<readonly [number, number]> {
  return section
    .locator('[data-slot="chart-plot"]')
    .evaluate((plot) => [plot.clientWidth, plot.clientHeight] as const);
}

/** The plot's size once it has stopped changing: a resize can move a pie's legend beside it a render later. */
async function steadySize(section: Locator): Promise<readonly [number, number]> {
  const before = await plotSize(section);
  await section.page().waitForTimeout(steadyMs);
  const after = await plotSize(section);
  return before.join("x") === after.join("x") ? after : steadySize(section);
}

/** Sizes `section` until its plot is `width` by `height`, a few tries at most, since a legend may wrap anew and one
 * beside a pie takes a share of the width. */
async function fit(
  section: Locator,
  { width, height }: CanvasRect,
  tries = fitTries,
): Promise<void> {
  const [plotWidth, plotHeight] = await steadySize(section);
  if ((plotWidth === width && plotHeight === height) || tries === 0) {
    return;
  }
  await section.evaluate(
    (element, [dw, dh]) => {
      const box = element.getBoundingClientRect();
      element.style.width = `${String(box.width + dw)}px`;
      element.style.height = `${String(box.height + dh)}px`;
      element.style.maxWidth = "none";
      // A flex item's own size, not its share of the page's.
      element.style.flex = "none";
    },
    [width - plotWidth, height - plotHeight] as const,
  );
  await expect.poll(async () => plotSize(section)).not.toStrictEqual([plotWidth, plotHeight]);
  await fit(section, { height, width, x: 0, y: 0 }, tries - 1);
}

/** Compares the canvas in `section` with the Angular screenshot `file` at `rect`, in the page. */
async function compare(
  section: Locator,
  { file, rect }: { readonly file: string; readonly rect: CanvasRect },
): Promise<Comparison> {
  const png = readFileSync(path.join(screenshots, file)).toString("base64");
  return section.locator('[data-slot="chart-plot"] canvas').evaluate(
    async (canvas, { base64, at }) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.codePointAt(0) ?? 0);
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
      });
      const [crop, drawn] = [
        new OffscreenCanvas(at.width, at.height).getContext("2d"),
        canvas instanceof HTMLCanvasElement ? canvas.getContext("2d") : null,
      ];
      if (crop === null || drawn === null) {
        throw new Error("no 2D context to compare in");
      }
      crop.drawImage(bitmap, -at.x, -at.y);
      // A pixel's four channels as one number: both are opaque, so only colours can differ.
      const [angular, react] = [crop, drawn].map(
        (context) => new Uint32Array(context.getImageData(0, 0, at.width, at.height).data.buffer),
      );
      const differing = [...(angular ?? []).keys()].filter(
        (index) => angular?.[index] !== react?.[index],
      );
      const [index] = differing;
      return {
        differing: differing.length,
        first:
          index === undefined ? null : ([index % at.width, Math.floor(index / at.width)] as const),
      };
    },
    { at: rect, base64: png },
  );
}

/** Whether the canvas reads the same now as a moment ago, its data having arrived at its size. */
async function settled(
  section: Locator,
  target: { readonly file: string; readonly rect: CanvasRect },
): Promise<boolean> {
  const first = await compare(section, target);
  await section.page().waitForTimeout(settleMs);
  const second = await compare(section, target);
  return first.differing === second.differing;
}

/** The canvas's size in its own pixels, as `width x height`. */
async function canvasSize(section: Locator): Promise<string> {
  return section
    .locator('[data-slot="chart-plot"] canvas')
    .evaluate((canvas) =>
      canvas instanceof HTMLCanvasElement ? `${String(canvas.width)}x${String(canvas.height)}` : "",
    );
}

/** Sizes the card `section` to the Angular canvas `name`'s size, waits for its chart to draw at that size, and compares
 * it with the Angular screenshot in `theme`. */
async function compared(
  section: Locator,
  { name, theme }: { readonly name: string; readonly theme: string },
): Promise<Comparison> {
  const rect = angularRect(name);
  const file = `${name}-${theme}.png`;
  await section.scrollIntoViewIfNeeded();
  await fit(section, rect);
  await expect
    .poll(async () => canvasSize(section))
    .toBe(`${String(rect.width)}x${String(rect.height)}`);
  // The chart asks for its data at the new size: wait until two reads a moment apart agree.
  await expect.poll(async () => settled(section, { file, rect }), { timeout: 30_000 }).toBe(true);
  return compare(section, { file, rect });
}

export { compared };
export type { CanvasRect, Comparison };
