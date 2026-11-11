/* The studio's edits to a theme's inputs: pure functions from one set of inputs to the next, so the page holds only
 * the inputs and the generator and `checkTheme` run on each change. */

import type { HueName, ThemeInputs } from "@basis/ui/theming";

/** The hues in the order the studio lists them. */
const hueNames: readonly HueName[] = ["brand", "neutral", "red", "amber", "green", "blue"];

/** The chroma a hue's slider reaches, past the most sRGB can show, and the neutral's, which is a tint. */
const hueChroma = 0.3;
const tintChroma = 0.05;

/** The chroma each hue's slider reaches. */
function maxChroma(name: HueName): number {
  return name === "neutral" ? tintChroma : hueChroma;
}

/** `inputs` with one hue's angle or chroma changed. */
function withHue(
  inputs: ThemeInputs,
  name: HueName,
  change: { readonly hue?: number; readonly chroma?: number },
): ThemeInputs {
  return { ...inputs, hues: { ...inputs.hues, [name]: { ...inputs.hues[name], ...change } } };
}

const pixelsPerRem = 16;

/** The base radius in whole pixels. */
function radiusPixels(inputs: ThemeInputs): number {
  return Math.trunc(Number(inputs.radius.base.replace(/rem$/u, "")) * pixelsPerRem);
}

/** `inputs` with the base radius set in pixels, written in rem as the themes write it. */
function withRadius(inputs: ThemeInputs, pixels: number): ThemeInputs {
  return { ...inputs, radius: { ...inputs.radius, base: `${String(pixels / pixelsPerRem)}rem` } };
}

/** A focus ring's length, written in pixels, as a number of them. */
function focusPixels(length: string): number {
  return Number(length.replace(/px$/u, ""));
}

/** `inputs` with the focus ring's width or offset set in pixels. */
function withFocus(
  inputs: ThemeInputs,
  change: { readonly width?: number; readonly offset?: number },
): ThemeInputs {
  return {
    ...inputs,
    focus: {
      offset: change.offset === undefined ? inputs.focus.offset : `${String(change.offset)}px`,
      width: change.width === undefined ? inputs.focus.width : `${String(change.width)}px`,
    },
  };
}

/** A name the studio exports under: lower case words joined by hyphens, as `defineTheme` asks. */
function themeName(text: string): string {
  return (
    text
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .replaceAll(/^-+|-+$/gu, "")
      .replace(/^(?=\d)/u, "theme-") || "brand"
  );
}

export {
  focusPixels,
  hueNames,
  maxChroma,
  radiusPixels,
  themeName,
  withFocus,
  withHue,
  withRadius,
};
