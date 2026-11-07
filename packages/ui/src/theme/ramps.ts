import { clampChroma } from "culori";
import type { Oklch } from "culori";

import { hues } from "./inputs.ts";
import type { HueName } from "./inputs.ts";

type Mode = "light" | "dark";

/** One step of a ramp: its OKLCH lightness in each mode, and its chroma as a share of its hue's. */
interface StepTone {
  readonly step: number;
  readonly light: number;
  readonly dark: number;
  readonly chromaShare: number;
}

/** The twelve steps, numbered as in the design. Every hue shares them, so a step means the same thing on every ramp.
 * Light solids are dark enough for white text, and dark solids light enough for dark text, so a solid is also
 * readable as text on its mode's surfaces. Chroma is quiet on backgrounds, full on solids and slightly calmer on
 * text. */
const stepTones = [
  // Steps 1 and 2: page backgrounds.
  { chromaShare: 0.04, dark: 0.178, light: 0.993, step: 1 },
  { chromaShare: 0.08, dark: 0.213, light: 0.981, step: 2 },
  // Steps 3 to 5: control fills at rest, hovered and pressed.
  { chromaShare: 0.16, dark: 0.252, light: 0.958, step: 3 },
  { chromaShare: 0.24, dark: 0.283, light: 0.935, step: 4 },
  { chromaShare: 0.32, dark: 0.312, light: 0.91, step: 5 },
  // Steps 6 to 8: borders. Step 8 is the darkest and clears 3:1 against the page, for control outlines and rings.
  { chromaShare: 0.4, dark: 0.348, light: 0.87, step: 6 },
  { chromaShare: 0.52, dark: 0.42, light: 0.79, step: 7 },
  { chromaShare: 0.72, dark: 0.56, light: 0.62, step: 8 },
  // Steps 9 and 10: solid fills.
  { chromaShare: 1, dark: 0.74, light: 0.47, step: 9 },
  { chromaShare: 1, dark: 0.79, light: 0.42, step: 10 },
  // Steps 11 and 12: text.
  { chromaShare: 0.82, dark: 0.8, light: 0.47, step: 11 },
  { chromaShare: 0.45, dark: 0.95, light: 0.24, step: 12 },
] as const satisfies readonly StepTone[];

/** A ramp's steps, numbered as in the design: 1 and 2 page backgrounds, 3 to 5 control fills, 6 to 8 borders, 9 and
 * 10 solid fills, 11 and 12 text. */
type Step = (typeof stepTones)[number]["step"];

const steps: readonly Step[] = stepTones.map((row) => row.step);

function stepTone(step: Step): StepTone {
  const row = stepTones.find((candidate) => candidate.step === step);
  if (row === undefined) {
    throw new RangeError(`Ramp step ${String(step)} does not exist; steps run from 1 to 12.`);
  }
  return row;
}

/** A colour at the given lightness on a hue, with its chroma reduced until it fits the sRGB gamut. */
function tone(name: HueName, lightness: number, share = 1): Oklch {
  const { chroma, hue } = hues[name];
  // oxlint-disable-next-line eslint/id-length -- culori names OKLCH's channels l, c and h, and Oxfmt unquotes keys.
  const wanted: Oklch = { c: chroma * share, h: hue, l: lightness, mode: "oklch" };
  // Citrix desktops display sRGB, so a colour outside it would be clipped unpredictably; reduce its chroma instead.
  return clampChroma(wanted, "oklch", "rgb");
}

/** One step of a hue's ramp in a mode. */
function rampStep(name: HueName, mode: Mode, step: Step): Oklch {
  const row = stepTone(step);
  return tone(name, row[mode], row.chromaShare);
}

/** A hue's whole ramp in a mode, step 1 first. */
function ramp(name: HueName, mode: Mode): readonly Oklch[] {
  return steps.map((step) => rampStep(name, mode, step));
}

export { ramp, rampStep, steps, tone };
export type { Mode, Step };
