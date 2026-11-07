import { clampChroma, type Oklch } from "culori";

import { hues, type HueName } from "./inputs.ts";

export type Mode = "light" | "dark";

/** A ramp's steps, numbered as in the design: 1 and 2 page backgrounds, 3 to 5 control fills, 6 to 8 borders, 9 and
 * 10 solid fills, 11 and 12 text. */
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const steps: readonly Step[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// The OKLCH lightness of each step. Every hue shares them, so a step means the same thing on every ramp. Light solids
// are dark enough for white text, and dark solids light enough for dark text, so a solid is also readable as text on
// its mode's surfaces. Step 8 is the darkest border and clears 3:1 against the page, for control outlines and rings.
const lightness: Readonly<Record<Mode, readonly number[]>> = {
  light: [0.993, 0.981, 0.958, 0.935, 0.91, 0.87, 0.79, 0.62, 0.47, 0.42, 0.47, 0.24],
  dark: [0.178, 0.213, 0.252, 0.283, 0.312, 0.348, 0.42, 0.56, 0.74, 0.79, 0.8, 0.95],
};

// Each step's chroma as a share of its hue's: quiet backgrounds, full solids, slightly calmer text.
const chromaShare: readonly number[] = [
  0.04, 0.08, 0.16, 0.24, 0.32, 0.4, 0.52, 0.72, 1, 1, 0.82, 0.45,
];

function at(values: readonly number[], step: Step): number {
  const value = values[step - 1];
  if (value === undefined) {
    throw new RangeError(`Ramp step ${String(step)} does not exist; steps run from 1 to 12.`);
  }
  return value;
}

/** A colour at the given lightness on a hue, with its chroma reduced until it fits the sRGB gamut. */
export function tone(name: HueName, lightnessValue: number, share = 1): Oklch {
  const { hue, chroma } = hues[name];
  const wanted: Oklch = { mode: "oklch", l: lightnessValue, c: chroma * share, h: hue };
  // Citrix desktops display sRGB, so a colour outside it would be clipped unpredictably; reduce its chroma instead.
  return clampChroma(wanted, "oklch", "rgb");
}

/** One step of a hue's ramp in a mode. */
export function rampStep(name: HueName, mode: Mode, step: Step): Oklch {
  return tone(name, at(lightness[mode], step), at(chromaShare, step));
}

/** A hue's whole ramp in a mode, step 1 first. */
export function ramp(name: HueName, mode: Mode): readonly Oklch[] {
  return steps.map((step) => rampStep(name, mode, step));
}
