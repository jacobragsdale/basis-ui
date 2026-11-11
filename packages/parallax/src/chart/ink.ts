/* The ink that reads on a colour: the theme's light ink or its dark one, by contrast with the colour's luminance, for
 * labels painted on bars and slices. The theme's colours are registered colour properties, which `getComputedStyle` gives in the form
 * they were written in: `oklch()` for @basis/ui's, `rgb()` for hex and named colours. */

/** The largest value of one channel written in hexadecimal. */
const channelMax = 255;
const hexadecimal = 16;
/** sRGB's transfer function: the linear segment's end, its slope, and the curve's offset, scale and power. */
const linearEnd = 0.04045;
const linearSlope = 12.92;
const curveOffset = 0.055;
const curveScale = 1.055;
const curvePower = 2.4;
/** Rec. 709's weights of the red, green and blue channels in luminance. */
const redWeight = 0.2126;
const greenWeight = 0.7152;
const blueWeight = 0.0722;
/** The flare WCAG's contrast ratio adds to each luminance. */
const flare = 0.05;
/** What 100% of an OKLab `a` or `b`, or of an OKLCH chroma, is. */
const okFullScale = 0.4;
const cube = 3;
const degreesPerTurn = 360;
const radiansPerDegree = (2 * Math.PI) / degreesPerTurn;

/** The two inks a label may take: the theme's `lightInk` and `darkInk`. */
interface Inks {
  readonly light: string;
  readonly dark: string;
}

/** The inks of parallax's own defaults: white and near-black. */
const defaultInks: Inks = { dark: "#111827", light: "#ffffff" };

/** One row of a 3 × 3 matrix, by the three coordinates it weighs. */
interface Row {
  readonly first: number;
  readonly second: number;
  readonly third: number;
}

/** OKLab to the cube roots of its cone responses, and those cubed to linear sRGB, as CSS Color 4 gives them. */
const labToCones: readonly Row[] = [
  { first: 1, second: 0.3963377774, third: 0.2158037573 },
  { first: 1, second: -0.1055613458, third: -0.0638541728 },
  { first: 1, second: -0.0894841775, third: -1.291485548 },
];
const conesToLinear: readonly Row[] = [
  { first: 4.0767416621, second: -3.3077115913, third: 0.2309699292 },
  { first: -1.2684380046, second: 2.6097574011, third: -0.3413193965 },
  { first: -0.0041960863, second: -0.7034186147, third: 1.707614701 },
];

/** The forms of colour whose channels `luminance` reads. */
const hexColor = /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})/iu;
const rgbColor = /^rgba?\(\s*(?<red>[\d.]+)[,\s]+(?<green>[\d.]+)[,\s]+(?<blue>[\d.]+)/iu;
const srgbColor = /^color\(srgb\s+(?<red>[\d.]+)\s+(?<green>[\d.]+)\s+(?<blue>[\d.]+)/iu;
const number = String.raw`[-+]?[\d.]+(?:e[-+]?\d+)?%?|none`;
const okLab = new RegExp(
  String.raw`^oklab\(\s*(?<l>${number})\s+(?<a>${number})\s+(?<b>${number})`,
  "iu",
);
const okLch = new RegExp(
  String.raw`^oklch\(\s*(?<l>${number})\s+(?<c>${number})\s+(?<h>${number})(?:deg)?`,
  "iu",
);

/** A match's red, green and blue, as written. */
function partsOf(
  groups: Readonly<Record<string, string | undefined>>,
): readonly (string | undefined)[] {
  return [groups["red"], groups["green"], groups["blue"]];
}

/** A channel's value, where 100% is `full` and `none` is 0. */
function channel(text: string | undefined, full: number): number {
  if (text === undefined || text.toLowerCase() === "none") {
    return 0;
  }
  return text.endsWith("%") ? (Number(text.slice(0, -1)) / 100) * full : Number(text);
}

function weigh(row: Row, values: readonly [number, number, number]): number {
  return row.first * values[0] + row.second * values[1] + row.third * values[2];
}

/** Linear sRGB from OKLab, clipped to the sRGB gamut as a canvas paints it. */
function linearOfLab(lab: readonly [number, number, number]): readonly number[] {
  const [long = 0, medium = 0, short = 0] = labToCones.map((row) => weigh(row, lab) ** cube);
  return conesToLinear.map((row) => Math.min(1, Math.max(0, weigh(row, [long, medium, short]))));
}

/** OKLab from `oklab()` or `oklch()`; null for any other form. */
function okLabOf(color: string): readonly [number, number, number] | null {
  const lab = okLab.exec(color)?.groups;
  if (lab !== undefined) {
    return [channel(lab["l"], 1), channel(lab["a"], okFullScale), channel(lab["b"], okFullScale)];
  }
  const lch = okLch.exec(color)?.groups;
  if (lch === undefined) {
    return null;
  }
  const chroma = channel(lch["c"], okFullScale);
  const hue = channel(lch["h"], 1) * radiansPerDegree;
  return [channel(lch["l"], 1), chroma * Math.cos(hue), chroma * Math.sin(hue)];
}

/** A colour's gamma-encoded sRGB channels from 0 to 1, from `#rrggbb`, `rgb()`, `rgba()` or `color(srgb …)`; null for
 * any other form. */
function encodedOf(color: string): readonly number[] | null {
  const hex = hexColor.exec(color)?.groups;
  if (hex !== undefined) {
    return partsOf(hex).map((part) => Number.parseInt(part ?? "0", hexadecimal) / channelMax);
  }
  const rgb = rgbColor.exec(color)?.groups;
  if (rgb !== undefined) {
    return partsOf(rgb).map((part) => Number(part) / channelMax);
  }
  const srgb = srgbColor.exec(color)?.groups;
  return srgb === undefined ? null : partsOf(srgb).map(Number);
}

/** A colour's linear sRGB channels from 0 to 1; null for a form `luminance` does not read. */
function linearOf(color: string): readonly number[] | null {
  const lab = okLabOf(color.trim());
  if (lab !== null) {
    return linearOfLab(lab);
  }
  return (
    encodedOf(color.trim())?.map((part) =>
      part <= linearEnd ? part / linearSlope : ((part + curveOffset) / curveScale) ** curvePower,
    ) ?? null
  );
}

/** A colour's relative luminance, from `rgb()`, `rgba()`, `#rrggbb`, `color(srgb …)`, `oklch()` or `oklab()`; null if
 * it is none of those. */
function luminance(color: string): number | null {
  const channels = linearOf(color);
  if (channels === null) {
    return null;
  }
  const [red = 0, green = 0, blue = 0] = channels;
  return redWeight * red + greenWeight * green + blueWeight * blue;
}

/** The contrast of two luminances, as WCAG measures it. */
function contrast(first: number, second: number): number {
  return (Math.max(first, second) + flare) / (Math.min(first, second) + flare);
}

/** The light ink or the dark one, whichever has the higher contrast with `color`; the light one if `color` can't be
 * read. An ink that can't be read counts as white, or as black. */
function inkOn(color: string, inks: Inks = defaultInks): string {
  const shade = luminance(color);
  if (shade === null) {
    return inks.light;
  }
  const light = luminance(inks.light) ?? 1;
  const dark = luminance(inks.dark) ?? 0;
  return contrast(light, shade) >= contrast(dark, shade) ? inks.light : inks.dark;
}

export { defaultInks, inkOn, luminance };
export type { Inks };
