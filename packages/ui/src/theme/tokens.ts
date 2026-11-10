// The semantic tokens: the only colours Tailwind exposes. Components and apps use these names and nothing else, with
// no opacity modifier: a hovered fill, an edge or a veil is a token of its own. Each one names, per mode, a ramp step,
// a lightness on a hue, or a fixed colour.

import type { HueName } from "./inputs.ts";
import type { Mode, Step } from "./ramps.ts";

/** Where a token's colour comes from in one mode. A step may carry an alpha, for the veil behind a dialog, which must
 * let the page show through. */
type Source =
  | { readonly hue: HueName; readonly step: Step; readonly alpha?: number }
  | { readonly hue: HueName; readonly lightness: number }
  | { readonly css: string };

type Token = Readonly<Record<Mode, Source>>;

/** A token's name and its colour in each mode. Tokens are listed in the order the stylesheet declares them. */
type Entry = readonly [name: string, token: Token];

function both(source: Source): Token {
  return { dark: source, light: source };
}

// Text on a solid fill: white on light mode's dark solids, the page's darkest neutral on dark mode's light ones.
const onSolid: Token = { dark: { hue: "neutral", step: 1 }, light: { css: "oklch(1 0 0)" } };

/** Surfaces and the text on them, under shadcn's names. Light mode lifts cards above a faintly grey page; dark mode
 * lifts them by lightness, since shadows barely show on dark surfaces. Fills sit above every surface they can land on:
 * dark mode's popover is step 3, so its muted fill is step 4 and its secondary and accent fills step 5. */
const surfaces: readonly Entry[] = [
  ["background", { dark: { hue: "neutral", step: 1 }, light: { hue: "neutral", step: 2 } }],
  ["foreground", both({ hue: "neutral", step: 12 })],
  ["card", { dark: { hue: "neutral", step: 2 }, light: { hue: "neutral", step: 1 } }],
  ["card-foreground", both({ hue: "neutral", step: 12 })],
  ["popover", { dark: { hue: "neutral", step: 3 }, light: { hue: "neutral", step: 1 } }],
  ["popover-foreground", both({ hue: "neutral", step: 12 })],
  ["muted", { dark: { hue: "neutral", step: 4 }, light: { hue: "neutral", step: 3 } }],
  ["muted-foreground", both({ hue: "neutral", step: 11 })],
  ["secondary", { dark: { hue: "neutral", step: 5 }, light: { hue: "neutral", step: 4 } }],
  // A secondary button hovered and pressed: each a step further from the page.
  ["secondary-hover", { dark: { hue: "neutral", step: 6 }, light: { hue: "neutral", step: 5 } }],
  ["secondary-active", { dark: { hue: "neutral", step: 7 }, light: { hue: "neutral", step: 6 } }],
  ["secondary-foreground", both({ hue: "neutral", step: 12 })],
  ["accent", { dark: { hue: "neutral", step: 5 }, light: { hue: "neutral", step: 4 } }],
  ["accent-foreground", both({ hue: "neutral", step: 12 })],
];

/** The main action, lines, control outlines and focus. A solid hovered is step 10; pressed, it goes as far again past
 * it, darker in light mode and lighter in dark, where the ramp has no step left for a fill. */
const actions: readonly Entry[] = [
  ["primary", both({ hue: "brand", step: 9 })],
  ["primary-hover", both({ hue: "brand", step: 10 })],
  [
    "primary-active",
    { dark: { hue: "brand", lightness: 0.84 }, light: { hue: "brand", lightness: 0.37 } },
  ],
  ["primary-foreground", onSolid],
  ["border", both({ hue: "neutral", step: 6 })],
  // The outline of a card or a popup, a step lighter than a border, as quiet as the page's own lines.
  ["edge", both({ hue: "neutral", step: 5 })],
  ["input", both({ hue: "neutral", step: 8 })],
  // The focus ring, drawn whole: it reaches 3:1 on every surface a control sits on.
  ["ring", both({ hue: "brand", step: 8 })],
  // A control that is off, such as Switch's track: dark enough to read as a control on any surface.
  ["control-off", both({ hue: "neutral", step: 8 })],
  // The fill of a disabled field, under the fade every disabled control takes.
  ["disabled", both({ hue: "neutral", step: 7 })],
  // The veil behind a dialog, a sheet or a drawer: the page's own colour, letting the page show through.
  [
    "overlay",
    {
      dark: { alpha: 0.7, hue: "neutral", step: 1 },
      light: { alpha: 0.7, hue: "neutral", step: 2 },
    },
  ],
];

// The sidebar set shadcn defines.
const sidebar: readonly Entry[] = [
  ["sidebar", { dark: { hue: "neutral", step: 2 }, light: { hue: "neutral", step: 1 } }],
  ["sidebar-foreground", both({ hue: "neutral", step: 12 })],
  ["sidebar-primary", both({ hue: "brand", step: 9 })],
  ["sidebar-primary-foreground", onSolid],
  ["sidebar-accent", both({ hue: "neutral", step: 4 })],
  ["sidebar-accent-foreground", both({ hue: "neutral", step: 12 })],
  ["sidebar-border", both({ hue: "neutral", step: 6 })],
  ["sidebar-ring", both({ hue: "brand", step: 8 })],
];

/** A status. Its colour is a solid fill, and text on the page; `-subtle` is the tint behind an alert or a badge, and
 * `-edge` the outline of an alert or a toast on it. Hovered, a tint steps away from its text, toward the page, since a
 * step toward it costs the text its 5.5:1 (light `success` text is 5.38:1 on step 4); pressed, it returns to rest, since
 * steps 1 and 2 are too close to tell apart in light mode. */
function status(name: string, hue: HueName): readonly Entry[] {
  return [
    [name, both({ hue, step: 9 })],
    [`${name}-foreground`, onSolid],
    [`${name}-subtle`, both({ hue, step: 3 })],
    [`${name}-subtle-hover`, both({ hue, step: 2 })],
    [`${name}-edge`, both({ hue, step: 7 })],
  ];
}

/** An environment banner's fill and the text on it. */
function banner(name: string, hue: HueName): readonly Entry[] {
  return [
    [name, both({ hue, step: 9 })],
    [`${name}-foreground`, onSolid],
  ];
}

/** Signed values. Loss sits well below gain in lightness, so the two stay apart for readers who cannot tell red from
 * green. */
const signed: readonly Entry[] = [
  ["gain", { dark: { hue: "green", lightness: 0.84 }, light: { hue: "green", lightness: 0.47 } }],
  ["loss", { dark: { hue: "red", lightness: 0.7 }, light: { hue: "red", lightness: 0.36 } }],
];

// Selected rows and cells, and search matches.
const selection: readonly Entry[] = [
  ["selection", both({ hue: "brand", step: 4 })],
  ["highlight", both({ hue: "amber", step: 4 })],
];

/** The categorical chart colours, in their fixed order: blue, orange, aqua, yellow, green, magenta, violet, red. They
 * are a validated reference palette with its fifth and sixth slots swapped, the order closest to it in which every
 * adjacent pair stays apart under protanopia, deuteranopia and tritanopia alike, in both modes. */
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

const charts: readonly Entry[] = chartColours.map(([light, dark], index) => [
  `chart-${String(index + 1)}`,
  { dark: { css: dark }, light: { css: light } },
]);

/** A token on a hue whose dark lightness mirrors its light one: the two add up to `mirror`. */
function mirrored(hue: HueName, lightness: number, mirror: number): Token {
  return { dark: { hue, lightness: mirror - lightness }, light: { hue, lightness } };
}

/** A sequential scale on blue, from near zero to the largest value: each step's lightness in light mode. */
const sequentialLightness = {
  "seq-1": 0.93,
  "seq-2": 0.86,
  "seq-3": 0.79,
  "seq-4": 0.72,
  "seq-5": 0.65,
  "seq-6": 0.58,
  "seq-7": 0.51,
  "seq-8": 0.44,
  "seq-9": 0.37,
};

/** In dark mode the sequential scale runs the other way in lightness, so that values near zero recede into the dark
 * page as they recede into the light one: a step's two lightnesses add up to this. */
const sequentialMirror = 1.2;

const sequential: readonly Entry[] = Object.entries(sequentialLightness).map(
  ([name, lightness]) => [name, mirrored("blue", lightness, sequentialMirror)],
);

/** A diverging scale: blue below the midpoint, red above, and a neutral grey at it. Each row names a blue step and
 * the red step as far from the midpoint, which share a lightness in light mode. */
const divergingArms = [
  { blue: "div-1", lightness: 0.42, red: "div-11" },
  { blue: "div-2", lightness: 0.52, red: "div-10" },
  { blue: "div-3", lightness: 0.62, red: "div-9" },
  { blue: "div-4", lightness: 0.72, red: "div-8" },
  { blue: "div-5", lightness: 0.82, red: "div-7" },
] as const;

/** A diverging step's two lightnesses add up to this, as the sequential scale's do. */
const divergingMirror = 1.24;

const diverging: readonly Entry[] = [
  ...divergingArms.map(({ blue, lightness }): Entry => [
    blue,
    mirrored("blue", lightness, divergingMirror),
  ]),
  ["div-6", { dark: { hue: "neutral", step: 6 }, light: { hue: "neutral", step: 4 } }],
  ...divergingArms
    .toReversed()
    .map(({ lightness, red }): Entry => [red, mirrored("red", lightness, divergingMirror)]),
];

/** Every token, in the stylesheet's order. */
const tokens: Readonly<Record<string, Token>> = Object.fromEntries([
  ...surfaces,
  ...actions,
  ...sidebar,
  // Status, always with an icon or a label as well as the colour.
  ...status("destructive", "red"),
  ...status("success", "green"),
  ...status("warning", "amber"),
  ...status("info", "blue"),
  ...signed,
  ...selection,
  // The environment banner.
  ...banner("env-dev", "green"),
  ...banner("env-qa", "amber"),
  ...banner("env-prod", "red"),
  // Data: chart series in order, a sequential scale and a diverging scale.
  ...charts,
  ...sequential,
  ...diverging,
]);

/** Every token's name, for code that reads tokens at run time, such as parallax's canvases. */
const tokenNames: readonly string[] = Object.keys(tokens);

export { tokenNames, tokens };
export type { Source, Token };
