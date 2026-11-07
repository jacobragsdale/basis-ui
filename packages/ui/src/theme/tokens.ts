// The semantic tokens: the only colours Tailwind exposes. Each one names, per mode, a ramp step, a lightness on a
// hue, or a fixed colour. Components and apps use these names and nothing else.

import type { HueName } from "./inputs.ts";
import type { Mode, Step } from "./ramps.ts";

/** Where a token's colour comes from in one mode. */
export type Source =
  | { readonly hue: HueName; readonly step: Step }
  | { readonly hue: HueName; readonly lightness: number }
  | { readonly css: string };

export type Token = Readonly<Record<Mode, Source>>;

function step(hue: HueName, value: Step): Source {
  return { hue, step: value };
}

function both(source: Source): Token {
  return { light: source, dark: source };
}

// Text on a solid fill: white on light mode's dark solids, the page's darkest neutral on dark mode's light ones.
const onSolid: Token = { light: { css: "oklch(1 0 0)" }, dark: step("neutral", 1) };

function status(hue: HueName): Record<string, Token> {
  return {
    "": both(step(hue, 9)),
    "-foreground": onSolid,
    "-subtle": both(step(hue, 3)),
  };
}

function named(prefix: string, group: Record<string, Token>): Record<string, Token> {
  return Object.fromEntries(
    Object.entries(group).map(([suffix, token]) => [`${prefix}${suffix}`, token]),
  );
}

// The categorical chart colours, in their fixed order: blue, orange, aqua, yellow, green, magenta, violet, red. They
// are a validated reference palette with its fifth and sixth slots swapped, the order closest to it in which every
// adjacent pair stays apart under protanopia, deuteranopia and tritanopia alike, in both modes.
const chartColours: readonly (readonly [light: string, dark: string])[] = [
  ["#2a78d6", "#3987e5"],
  ["#eb6834", "#d95926"],
  ["#1baf7a", "#199e70"],
  ["#eda100", "#c98500"],
  ["#008300", "#008300"],
  ["#e87ba4", "#d55181"],
  ["#6250d6", "#9085e9"],
  ["#e34948", "#e66767"],
];

// A sequential scale on blue, from near zero to the largest value. In dark mode it runs the other way in lightness, so
// that values near zero recede into the dark page as they recede into the light one.
const sequentialLightness: readonly number[] = [
  0.93, 0.86, 0.79, 0.72, 0.65, 0.58, 0.51, 0.44, 0.37,
];

// A diverging scale: blue below the midpoint, red above, and a neutral grey at it.
const divergingArm: readonly number[] = [0.42, 0.52, 0.62, 0.72, 0.82];

function sequential(): Record<string, Token> {
  return Object.fromEntries(
    sequentialLightness.map((lightness, index) => [
      `seq-${String(index + 1)}`,
      { light: { hue: "blue", lightness }, dark: { hue: "blue", lightness: 1.2 - lightness } },
    ]),
  );
}

function diverging(): Record<string, Token> {
  const entries: [string, Token][] = [];
  divergingArm.forEach((lightness, index) => {
    entries.push([
      `div-${String(index + 1)}`,
      { light: { hue: "blue", lightness }, dark: { hue: "blue", lightness: 1.24 - lightness } },
    ]);
  });
  entries.push(["div-6", { light: step("neutral", 4), dark: step("neutral", 6) }]);
  [...divergingArm].reverse().forEach((lightness, index) => {
    entries.push([
      `div-${String(index + 7)}`,
      { light: { hue: "red", lightness }, dark: { hue: "red", lightness: 1.24 - lightness } },
    ]);
  });
  return Object.fromEntries(entries);
}

export const tokens: Readonly<Record<string, Token>> = {
  // Surfaces and the text on them, under shadcn's names. Light mode lifts cards above a faintly grey page; dark mode
  // lifts them by lightness, since shadows barely show on dark surfaces.
  background: { light: step("neutral", 2), dark: step("neutral", 1) },
  foreground: both(step("neutral", 12)),
  card: { light: step("neutral", 1), dark: step("neutral", 2) },
  "card-foreground": both(step("neutral", 12)),
  popover: { light: step("neutral", 1), dark: step("neutral", 3) },
  "popover-foreground": both(step("neutral", 12)),
  muted: both(step("neutral", 3)),
  "muted-foreground": both(step("neutral", 11)),
  secondary: both(step("neutral", 4)),
  "secondary-foreground": both(step("neutral", 12)),
  accent: both(step("neutral", 4)),
  "accent-foreground": both(step("neutral", 12)),

  // The main action, lines, control outlines and focus.
  primary: both(step("brand", 9)),
  "primary-foreground": onSolid,
  border: both(step("neutral", 6)),
  input: both(step("neutral", 8)),
  ring: both(step("brand", 8)),

  // shadcn's sidebar set.
  sidebar: { light: step("neutral", 1), dark: step("neutral", 2) },
  "sidebar-foreground": both(step("neutral", 12)),
  "sidebar-primary": both(step("brand", 9)),
  "sidebar-primary-foreground": onSolid,
  "sidebar-accent": both(step("neutral", 4)),
  "sidebar-accent-foreground": both(step("neutral", 12)),
  "sidebar-border": both(step("neutral", 6)),
  "sidebar-ring": both(step("brand", 8)),

  // Status. A status colour is a solid fill, and text on the page; `-subtle` is the tint behind an alert or a badge.
  ...named("destructive", status("red")),
  ...named("success", status("green")),
  ...named("warning", status("amber")),
  ...named("info", status("blue")),

  // Signed values. Loss sits well below gain in lightness, so the two stay apart for readers who cannot tell red from
  // green.
  gain: { light: { hue: "green", lightness: 0.47 }, dark: { hue: "green", lightness: 0.84 } },
  loss: { light: { hue: "red", lightness: 0.36 }, dark: { hue: "red", lightness: 0.7 } },

  // Selected rows and cells, and search matches.
  selection: both(step("brand", 4)),
  highlight: both(step("amber", 4)),

  // The environment banner.
  ...named("env-dev", { "": both(step("green", 9)), "-foreground": onSolid }),
  ...named("env-qa", { "": both(step("amber", 9)), "-foreground": onSolid }),
  ...named("env-prod", { "": both(step("red", 9)), "-foreground": onSolid }),

  // Data: chart series in order, a sequential scale and a diverging scale.
  ...Object.fromEntries(
    chartColours.map(([light, dark], index) => [
      `chart-${String(index + 1)}`,
      { light: { css: light }, dark: { css: dark } },
    ]),
  ),
  ...sequential(),
  ...diverging(),
};

/** Every token's name, for code that reads tokens at run time, such as parallax's canvases. */
export const tokenNames: readonly string[] = Object.keys(tokens);
