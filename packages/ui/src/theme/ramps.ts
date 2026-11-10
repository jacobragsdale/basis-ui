// A hue's twelve-step ramp in each mode, from the hue and its curve: pure functions of a theme's inputs.

import { clampChroma } from "culori";
import type { Oklch } from "culori";

import type { Hue, Mode, Step, StepTone } from "./inputs.ts";

function stepTone({ curve }: Hue, step: Step): StepTone {
  const row = curve.find((candidate) => candidate.step === step);
  if (row === undefined) {
    throw new RangeError(`Ramp step ${String(step)} does not exist; steps run from 1 to 12.`);
  }
  return row;
}

/** A colour at the given lightness on a hue, with its chroma reduced until it fits the sRGB gamut. */
function tone({ chroma, hue }: Hue, lightness: number, share = 1): Oklch {
  const wanted: Oklch = { c: chroma * share, h: hue, l: lightness, mode: "oklch" };
  // Citrix desktops display sRGB, so a colour outside it would be clipped unpredictably; reduce its chroma instead.
  return clampChroma(wanted, "oklch", "rgb");
}

/** One step of a hue's ramp in a mode. */
function rampStep(hue: Hue, mode: Mode, step: Step): Oklch {
  const row = stepTone(hue, step);
  return tone(hue, row[mode], row.chromaShare);
}

/** A hue's whole ramp in a mode, step 1 first. */
function ramp(hue: Hue, mode: Mode): readonly Oklch[] {
  return hue.curve.map(({ step }) => rampStep(hue, mode, step));
}

export { ramp, rampStep, tone };
