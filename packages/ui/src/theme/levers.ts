// The input of a theme that moves a token's colour, and the nearest value of it that passes a check: what each of
// `checkTheme`'s failures ends with. Pure functions of a theme's inputs.

import { clampChroma, converter, formatHex, parse } from "culori";
import type { Color, Oklch } from "culori";

import { resolve } from "./colours.ts";
import type { Hue, Mode, Surfaces, ThemeInputs } from "./inputs.ts";
import { tone } from "./ramps.ts";
import { tokensOf } from "./tokens.ts";
import type { Source } from "./tokens.ts";

/** One value of an input, and the colour the token takes at it. */
interface Candidate {
  readonly value: string;
  readonly colour: Color;
}

/** One input a token's colour comes from, and the colour the token would have at each value of it, nearest first. */
interface Lever {
  /** The input, as its path in the theme's file reads. */
  readonly input: string;
  readonly candidates: () => Iterable<Candidate>;
}

/** What a fix must reach: whether a figure passes, and the figure as the fix states it. */
interface Target {
  readonly passes: (figure: number) => boolean;
  readonly shown: (figure: number) => string;
}

/** The precision of a lightness the search tries, and the decimal places it is written with: the stylesheet's. */
const lightnessStep = 0.001;
const lightnessPlaces = 3;

const toOklch = converter("oklch");

/** Lightnesses from `from` outward, one step at a time on either side, within 0 to 1. */
function* lightnessesFrom(from: number): Generator<number> {
  const start = Math.round(from / lightnessStep);
  const last = Math.round(1 / lightnessStep);
  for (let offset = 1; offset <= last; offset += 1) {
    for (const index of [start + offset, start - offset]) {
      if (index >= 0 && index <= last) {
        yield index * lightnessStep;
      }
    }
  }
}

/** A lever on a lightness on a hue, a ramp step's or a shade's, from its lightness now. */
function onHue(
  hue: Hue,
  input: string,
  { lightness, share = 1 }: { readonly lightness: number; readonly share?: number },
): Lever {
  return {
    *candidates() {
      for (const candidate of lightnessesFrom(lightness)) {
        yield {
          colour: tone(hue, candidate, share),
          value: Number(candidate.toFixed(lightnessPlaces)).toString(),
        };
      }
    },
    input,
  };
}

/** A lever on a CSS colour's lightness, keeping its hue and as much of its chroma as sRGB holds, written in hex. */
function onCss(input: string, css: string): Lever | undefined {
  const parsed = parse(css);
  if (parsed === undefined) {
    return undefined;
  }
  const { c: chroma, h: hue = 0, l: lightness } = toOklch(parsed);
  return {
    *candidates() {
      for (const candidate of lightnessesFrom(lightness)) {
        const wanted: Oklch = { c: chroma, h: hue, l: candidate, mode: "oklch" };
        const value = formatHex(clampChroma(wanted, "oklch", "rgb"));
        const colour = parse(value);
        if (colour !== undefined) {
          yield { colour, value };
        }
      }
    },
    input,
  };
}

/** The surfaces whose step is a theme's input, by token. */
const surfaceInputs: Readonly<Record<string, keyof Surfaces>> = {
  accent: "accent",
  background: "background",
  card: "card",
  muted: "muted",
  popover: "popover",
  secondary: "secondary",
  "secondary-active": "secondaryActive",
  "secondary-hover": "secondaryHover",
  sidebar: "sidebar",
  "sidebar-accent": "sidebarAccent",
};

/** The tokens at a lightness on a hue, by the input that holds it. */
const shadeInputs: Readonly<Record<string, string>> = {
  gain: "signed.gain",
  loss: "signed.loss",
  "primary-active": "pressed",
};

/** Where a token's colour comes from, in a theme and mode. */
interface Origin {
  readonly theme: ThemeInputs;
  readonly mode: Mode;
  readonly name: string;
  readonly source: Source;
}

/** A surface moves by its step, nearest first. */
function surfaceLever({ mode, name, source, theme }: Origin): Lever | undefined {
  const surface = surfaceInputs[name];
  if (surface === undefined || !("step" in source)) {
    return undefined;
  }
  const from = theme.surfaces[mode][surface];
  const nearest = theme.hues[source.hue].curve
    .map(({ step }) => step)
    .filter((step) => step !== from)
    .toSorted((first, second) => Math.abs(first - from) - Math.abs(second - from));
  return {
    *candidates() {
      for (const step of nearest) {
        yield { colour: resolve(theme, { hue: source.hue, step }, mode), value: String(step) };
      }
    },
    input: `surfaces.${mode}.${surface}`,
  };
}

/** A token on a ramp step moves by that step's lightness on its hue's curve. */
function stepLever({ mode, source, theme }: Origin): Lever | undefined {
  if (!("step" in source)) {
    return undefined;
  }
  const hue = theme.hues[source.hue];
  const row = hue.curve.find(({ step }) => step === source.step);
  return row === undefined
    ? undefined
    : onHue(hue, `hues.${source.hue}'s step ${String(source.step)} ${mode}`, {
        lightness: row[mode],
        share: row.chromaShare,
      });
}

/** A shade, `gain`, `loss` or the pressed primary, moves by its lightness. */
function shadeLever({ mode, name, source, theme }: Origin): Lever | undefined {
  const shade = shadeInputs[name];
  return shade === undefined || !("lightness" in source)
    ? undefined
    : onHue(theme.hues[source.hue], `${shade}.${mode}`, { lightness: source.lightness });
}

/** A chart series moves by its colour. */
function seriesLever({ mode, name, source }: Origin): Lever | undefined {
  const series = /^chart-(?<number>\d+)$/u.exec(name)?.groups?.["number"];
  return series === undefined || !("css" in source)
    ? undefined
    : onCss(`charts.categorical[${String(Number(series) - 1)}].${mode}`, source.css);
}

/** The input that moves `name`'s colour in `mode`, if one does. */
function leverOf(theme: ThemeInputs, name: string, mode: Mode): Lever | undefined {
  const source = tokensOf(theme)[name]?.[mode];
  if (source === undefined) {
    return undefined;
  }
  const origin = { mode, name, source, theme };
  return surfaceLever(origin) ?? stepLever(origin) ?? shadeLever(origin) ?? seriesLever(origin);
}

/** The lever's nearest value whose figure passes. */
function nearestPassing(
  lever: Lever,
  measure: (colour: Color) => number,
  passes: (figure: number) => boolean,
): { readonly value: string; readonly figure: number } | undefined {
  for (const { colour, value } of lever.candidates()) {
    const figure = measure(colour);
    if (passes(figure)) {
      return { figure, value };
    }
  }
  return undefined;
}

/** The fix for a failure: the nearest value of the first lever with one that passes, as "set INPUT to VALUE (FIGURE)".
 * `measure` is the figure with the lever at an index in `levers` moved to a colour. */
function fixOf(
  levers: readonly (Lever | undefined)[],
  measure: (colour: Color, lever: number) => number,
  { passes, shown }: Target,
): string {
  for (const [index, lever] of levers.entries()) {
    const found =
      lever === undefined
        ? undefined
        : nearestPassing(lever, (colour) => measure(colour, index), passes);
    if (lever !== undefined && found !== undefined) {
      return `set ${lever.input} to ${found.value} (${shown(found.figure)})`;
    }
  }
  return "no single input of the theme passes it, so change both of the pair's inputs";
}

export { fixOf, leverOf };
export type { Lever, Target };
