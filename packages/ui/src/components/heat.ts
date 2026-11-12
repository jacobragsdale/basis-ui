/* What HeatCell knows of the theme's scales: the step a value falls on, sequential from near zero to the largest, or
 * diverging either side of a midpoint, and the ink that reads on that step. The ink is measured, as parallax's canvas
 * measures its heat cells': the step's colour and the two inks, the page's text and its background, are read from the
 * stylesheet, drawn on a canvas a pixel wide to read them as sRGB, and the ink with the greater WCAG contrast is taken.
 * The mid steps of a scale clear 5.5:1, the floor text holds to, with neither ink in some themes and modes, so a fixed
 * ink per step would fail; the measure takes the better one in each theme and mode, and a step on which neither clears
 * the floor is merged into the next step toward its end of the scale, which keeps the order of values while every step
 * a cell shows reads. The measures are kept until the theme, mode or density changes. */

import { themeChangeEvent } from "#theme/preferences.ts";

/** A scale's step token, such as `seq-4` or `div-9`. */
type HeatToken = `seq-${number}` | `div-${number}`;

/** How a value maps to a step: from `min` to `max` on the sequential scale, or either side of `mid` on the diverging
 * scale, as far as the larger of `min` and `max` from it. */
interface HeatDomain {
  /** The scale: sequential, from near zero to the largest, or diverging, either side of a midpoint. */
  readonly scale: "sequential" | "diverging";
  /** The least value, such as the column's; a value below it takes the scale's first step. */
  readonly min: number;
  /** The greatest value, such as the column's; a value above it takes the scale's last step. */
  readonly max: number;
  /** The diverging scale's midpoint; 0 unless set. */
  readonly mid?: number | undefined;
}

const sequentialSteps = 9;
/** The diverging scale's steps either side of its midpoint, `div-6`. */
const divergingArm = 5;
const divergingMidpoint = 6;

/** The step `value` falls on in `domain`; a value outside it takes the nearest end. */
function heatToken(value: number, { scale, min, max, mid = 0 }: HeatDomain): HeatToken {
  if (scale === "sequential") {
    const share = max === min ? 1 : (value - min) / (max - min);
    const step = Math.min(sequentialSteps, Math.max(1, Math.ceil(share * sequentialSteps)));
    return `seq-${step}`;
  }
  const reach = Math.max(Math.abs(max - mid), Math.abs(min - mid));
  const share = reach === 0 ? 0 : Math.min(1, Math.abs(value - mid) / reach);
  const away = Math.ceil(share * divergingArm);
  const step = value < mid ? divergingMidpoint - away : divergingMidpoint + away;
  return `div-${step}`;
}

type Rgb = readonly [number, number, number];

/** A CSS colour as sRGB, read back from a canvas a pixel wide. */
function rgbOf(context: CanvasRenderingContext2D, colour: string): Rgb {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return [red, green, blue];
}

const srgbKnee = 0.03928;
const srgbScale = 12.92;
const srgbOffset = 0.055;
const srgbDivisor = 1.055;
const srgbGamma = 2.4;
const channelMax = 255;
const redWeight = 0.2126;
const greenWeight = 0.7152;
const blueWeight = 0.0722;
const flare = 0.05;

/** A channel from 0 to 255 as linear light. */
function linearOf(channel: number): number {
  const encoded = channel / channelMax;
  return encoded <= srgbKnee
    ? encoded / srgbScale
    : ((encoded + srgbOffset) / srgbDivisor) ** srgbGamma;
}

/** WCAG's relative luminance. */
function luminance([red, green, blue]: Rgb): number {
  return redWeight * linearOf(red) + greenWeight * linearOf(green) + blueWeight * linearOf(blue);
}

/** WCAG's contrast between two colours. */
function contrast(first: Rgb, second: Rgb): number {
  const one = luminance(first);
  const other = luminance(second);
  return (Math.max(one, other) + flare) / (Math.min(one, other) + flare);
}

/** Which ink reads on a step: the page's text, `foreground`, or its background. */
type HeatInk = "foreground" | "background";

/** A step's better ink, and whether it clears the floor text holds to. */
interface InkMeasure {
  readonly ink: HeatInk;
  readonly readable: boolean;
}

/** The contrast text holds to, the floor `checkTheme` sets. */
const textFloor = 5.5;

const inks = new Map<HeatToken, InkMeasure>();
let version = 0;
const listeners = new Set<() => void>();

/** The ink with the greater contrast on `token`, as the stylesheet draws them on the page's root now, and whether it
 * clears the floor. */
function measureInk(token: HeatToken): InkMeasure {
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (context === null) {
    return { ink: "foreground", readable: true };
  }
  const style = getComputedStyle(document.documentElement);
  const colour = (name: string): Rgb => rgbOf(context, style.getPropertyValue(`--${name}`).trim());
  const step = colour(token);
  const onForeground = contrast(colour("foreground"), step);
  const onBackground = contrast(colour("background"), step);
  return onForeground >= onBackground
    ? { ink: "foreground", readable: onForeground >= textFloor }
    : { ink: "background", readable: onBackground >= textFloor };
}

/** A step's measure, taken once until the theme, mode or density changes. */
function measureOf(token: HeatToken): InkMeasure {
  const measure = inks.get(token) ?? measureInk(token);
  inks.set(token, measure);
  return measure;
}

/** The next step toward the end of the scale `token` lies toward: up the sequential scale, and away from the diverging
 * scale's midpoint; none past an end. */
function outward(token: HeatToken): HeatToken | undefined {
  const [scale, number] = token.split("-");
  const step = Number(number);
  if (scale === "seq") {
    return step < sequentialSteps ? `seq-${step + 1}` : undefined;
  }
  if (step === divergingMidpoint) {
    return undefined;
  }
  const next = step < divergingMidpoint ? step - 1 : step + 1;
  return next < 1 || next > divergingMidpoint + divergingArm ? undefined : `div-${next}`;
}

/** The step a cell shows for `token`, the nearest toward its end whose ink reads, and that ink. */
function shownStep(token: HeatToken): { readonly token: HeatToken; readonly ink: HeatInk } {
  const measure = measureOf(token);
  const next = measure.readable ? undefined : outward(token);
  return next === undefined ? { ink: measure.ink, token } : shownStep(next);
}

/** Forgets every measure, as the theme, mode or density changed, and tells those that hear. */
function forget(): void {
  inks.clear();
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** Hears a change of theme, mode or density, which forgets every measure. */
function subscribeHeat(listener: () => void): () => void {
  if (listeners.size === 0) {
    document.addEventListener(themeChangeEvent, forget);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener(themeChangeEvent, forget);
    }
  };
}

/** The measures' version, which a change of theme moves on. */
function heatVersion(): number {
  return version;
}

export { contrast, heatToken, heatVersion, luminance, outward, shownStep, subscribeHeat };
export type { HeatDomain, HeatInk, HeatToken };
