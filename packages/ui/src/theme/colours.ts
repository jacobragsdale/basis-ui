// A theme's colours: each token's source, resolved on the theme's hues, as culori reads it and as the stylesheet writes
// it. Pure functions of a theme's inputs.

import { parse } from "culori";
import type { Color, Oklch } from "culori";

import type { Mode, ThemeInputs } from "./inputs.ts";
import { rampStep, tone } from "./ramps.ts";
import { tokensOf } from "./tokens.ts";
import type { Source } from "./tokens.ts";

/** A source on one of the theme's hues: a ramp step, or a lightness. */
type HueSource = Exclude<Source, { readonly css: string }>;

/** The decimal places the stylesheet writes each OKLCH channel with. */
const places = { chroma: 4, hue: 1, lightness: 3 } as const;

/** A hue source's colour in a theme and mode, with its alpha when it has one. */
function toneOf(theme: ThemeInputs, source: HueSource, inMode: Mode): Oklch {
  const hue = theme.hues[source.hue];
  if ("step" in source) {
    const colour = rampStep(hue, inMode, source.step);
    return source.alpha === undefined ? colour : { ...colour, alpha: source.alpha };
  }
  return tone(hue, source.lightness);
}

/** A token source's colour in a theme and mode, as culori reads it. */
function resolve(theme: ThemeInputs, source: Source, inMode: Mode): Color {
  if ("css" in source) {
    const parsed = parse(source.css);
    if (parsed === undefined) {
      throw new TypeError(
        `The ${theme.name} theme's colour ${source.css} is not CSS that culori can read.`,
      );
    }
    return parsed;
  }
  return toneOf(theme, source, inMode);
}

/** A token's colour in a theme and mode. */
function colourOf(theme: ThemeInputs, name: string, inMode: Mode): Color {
  const token = tokensOf(theme)[name];
  if (token === undefined) {
    throw new RangeError(`The theme has no token named ${name}.`);
  }
  return resolve(theme, token[inMode], inMode);
}

function round(value: number | undefined, digits: number): string {
  return Number((value ?? 0).toFixed(digits)).toString();
}

function format(theme: ThemeInputs, source: Source, inMode: Mode): string {
  if ("css" in source) {
    return source.css;
  }
  const colour = toneOf(theme, source, inMode);
  const lightness = round(colour.l, places.lightness);
  const chroma = round(colour.c, places.chroma);
  const hue = round(colour.h, places.hue);
  const alpha = colour.alpha === undefined ? "" : ` / ${String(colour.alpha)}`;
  return `oklch(${lightness} ${chroma} ${hue}${alpha})`;
}

/** A token's value in a theme and mode, as the stylesheet writes it. */
function tokenValue(theme: ThemeInputs, name: string, inMode: Mode): string {
  const token = tokensOf(theme)[name];
  if (token === undefined) {
    throw new RangeError(`The theme has no token named ${name}.`);
  }
  return format(theme, token[inMode], inMode);
}

/** A theme's tokens in a mode, as declarations. */
function tokenDeclarations(theme: ThemeInputs, inMode: Mode): string {
  return Object.entries(tokensOf(theme))
    .map(([name, token]) => `  --${name}: ${format(theme, token[inMode], inMode)};`)
    .join("\n");
}

export { colourOf, resolve, tokenDeclarations, tokenValue };
