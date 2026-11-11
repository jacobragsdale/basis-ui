// The semantic tokens: the only colours Tailwind exposes. Components and apps use these names and nothing else, with
// no opacity modifier: a hovered fill, an edge or a veil is a token of its own. Each one names, per mode, a ramp step,
// a lightness on a hue, or a fixed colour. Every theme has the same tokens: which step each one takes is the library's,
// and where a theme may differ, such as its surfaces' steps or its chart palettes, the step or value is its input.

import type {
  DivergingArmName,
  HueName,
  Mode,
  SequentialName,
  Shade,
  Step,
  Surfaces,
  ThemeInputs,
} from "./inputs.ts";
import { theme as defaultTheme } from "./themes/default.ts";

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

const white: Source = { css: "oklch(1 0 0)" };

/** Dark text on a light solid: the neutral's darkest step in each mode, its text step in light mode and its page step
 * in dark mode. */
const darkInk: Token = { dark: { hue: "neutral", step: 1 }, light: { hue: "neutral", step: 12 } };

// Text on a solid fill: white on light mode's dark solids, the page's darkest neutral on dark mode's light ones.
const onSolid: Token = { dark: darkInk.dark, light: white };

/** Text on a hue's solid steps, 9 and 10, in each mode: its `ink`, or `onSolid`'s. */
function inkOn(theme: ThemeInputs, hue: HueName): Token {
  const { ink } = theme.hues[hue];
  const source = (mode: Mode): Source => {
    const chosen = ink?.[mode];
    if (chosen === undefined) {
      return onSolid[mode];
    }
    return chosen === "white" ? white : darkInk[mode];
  };
  return { dark: source("dark"), light: source("light") };
}

/** The neutral's step for a surface in each mode, from the theme's elevation steps. */
function surface(theme: ThemeInputs, name: keyof Surfaces): Token {
  return {
    dark: { hue: "neutral", step: theme.surfaces.dark[name] },
    light: { hue: "neutral", step: theme.surfaces.light[name] },
  };
}

/** A token at a lightness on a hue in each mode. */
function shade({ dark, hue, light }: Shade): Token {
  return { dark: { hue, lightness: dark }, light: { hue, lightness: light } };
}

/** Surfaces and the text on them, under shadcn's names. Each surface's step in each mode is the theme's; the text on
 * them is the neutral's text steps. */
function surfaces(theme: ThemeInputs): readonly Entry[] {
  return [
    ["background", surface(theme, "background")],
    ["foreground", both({ hue: "neutral", step: 12 })],
    ["card", surface(theme, "card")],
    ["card-foreground", both({ hue: "neutral", step: 12 })],
    ["popover", surface(theme, "popover")],
    ["popover-foreground", both({ hue: "neutral", step: 12 })],
    ["muted", surface(theme, "muted")],
    ["muted-foreground", both({ hue: "neutral", step: 11 })],
    ["secondary", surface(theme, "secondary")],
    // A secondary button hovered and pressed.
    ["secondary-hover", surface(theme, "secondaryHover")],
    ["secondary-active", surface(theme, "secondaryActive")],
    ["secondary-foreground", both({ hue: "neutral", step: 12 })],
    ["accent", surface(theme, "accent")],
    ["accent-foreground", both({ hue: "neutral", step: 12 })],
  ];
}

/** The main action, lines, control outlines and focus. A solid hovered is step 10; pressed, it is the theme's
 * `pressed` lightness. */
function actions(theme: ThemeInputs): readonly Entry[] {
  return [
    ["primary", both({ hue: "brand", step: 9 })],
    ["primary-hover", both({ hue: "brand", step: 10 })],
    ["primary-active", shade(theme.pressed)],
    ["primary-foreground", inkOn(theme, "brand")],
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
        dark: { alpha: theme.overlay, hue: "neutral", step: theme.surfaces.dark.background },
        light: { alpha: theme.overlay, hue: "neutral", step: theme.surfaces.light.background },
      },
    ],
  ];
}

// The sidebar set shadcn defines.
function sidebar(theme: ThemeInputs): readonly Entry[] {
  return [
    ["sidebar", surface(theme, "sidebar")],
    ["sidebar-foreground", both({ hue: "neutral", step: 12 })],
    ["sidebar-primary", both({ hue: "brand", step: 9 })],
    ["sidebar-primary-foreground", inkOn(theme, "brand")],
    ["sidebar-accent", surface(theme, "sidebarAccent")],
    ["sidebar-accent-foreground", both({ hue: "neutral", step: 12 })],
    ["sidebar-border", both({ hue: "neutral", step: 6 })],
    ["sidebar-ring", both({ hue: "brand", step: 8 })],
  ];
}

/** A status. Its colour is its ramp's text step, 11, which is text on the page and also a fill, as under a failed
 * grid's message or a market's dot, with white on it in light mode; `-subtle` is the tint behind an alert or a badge,
 * and `-edge` the outline of an alert or a toast on it. The status's solid, step 9, is left to its banner, at its
 * hue's own lightness. Hovered, a tint steps away from its text, toward the page, since a
 * step toward it costs the text its 5.5:1 (light `success` text is 5.38:1 on step 4); pressed, it returns to rest, since
 * steps 1 and 2 are too close to tell apart in light mode. */
function status(name: string, hue: HueName): readonly Entry[] {
  return [
    [name, both({ hue, step: 11 })],
    [`${name}-foreground`, onSolid],
    [`${name}-subtle`, both({ hue, step: 3 })],
    [`${name}-subtle-hover`, both({ hue, step: 2 })],
    [`${name}-edge`, both({ hue, step: 7 })],
  ];
}

/** An environment banner's fill, its hue's solid, and the text on it, the hue's ink. */
function banner(theme: ThemeInputs, name: string, hue: HueName): readonly Entry[] {
  return [
    [name, both({ hue, step: 9 })],
    [`${name}-foreground`, inkOn(theme, hue)],
  ];
}

// Selected rows and cells, and search matches.
const selection: readonly Entry[] = [
  ["selection", both({ hue: "brand", step: 4 })],
  ["highlight", both({ hue: "amber", step: 4 })],
];

/** A token on a hue whose dark lightness mirrors its light one: the two add up to `mirror`. */
function mirrored(hue: HueName, lightness: number, mirror: number): Token {
  return { dark: { hue, lightness: mirror - lightness }, light: { hue, lightness } };
}

/** The sequential scale's steps, from near zero to the largest value. */
const sequentialNames: readonly SequentialName[] = [
  "seq-1",
  "seq-2",
  "seq-3",
  "seq-4",
  "seq-5",
  "seq-6",
  "seq-7",
  "seq-8",
  "seq-9",
];

/** The diverging scale's steps below its midpoint, from the low end, each with its twin as far above it. */
const divergingArms: readonly { readonly low: DivergingArmName; readonly high: string }[] = [
  { high: "div-11", low: "div-1" },
  { high: "div-10", low: "div-2" },
  { high: "div-9", low: "div-3" },
  { high: "div-8", low: "div-4" },
  { high: "div-7", low: "div-5" },
];

/** Chart series in order, a sequential scale on one hue, and a diverging scale on two either side of a neutral
 * midpoint, `div-6`. */
function charts({ charts: { categorical, diverging, sequential } }: ThemeInputs): readonly Entry[] {
  return [
    ...categorical.map(({ dark, light }, index): Entry => [
      `chart-${String(index + 1)}`,
      { dark: { css: dark }, light: { css: light } },
    ]),
    ...sequentialNames.map((name): Entry => [
      name,
      mirrored(sequential.hue, sequential.lightness[name], sequential.mirror),
    ]),
    ...divergingArms.map(({ low }): Entry => [
      low,
      mirrored(diverging.low, diverging.lightness[low], diverging.mirror),
    ]),
    [
      "div-6",
      {
        dark: { hue: "neutral", step: diverging.midpoint.dark },
        light: { hue: "neutral", step: diverging.midpoint.light },
      },
    ],
    ...divergingArms
      .toReversed()
      .map(({ high, low }): Entry => [
        high,
        mirrored(diverging.high, diverging.lightness[low], diverging.mirror),
      ]),
  ];
}

/** A theme's tokens, in the stylesheet's order. */
function tokensOf(theme: ThemeInputs): Readonly<Record<string, Token>> {
  return Object.fromEntries([
    ...surfaces(theme),
    ...actions(theme),
    ...sidebar(theme),
    // Status, always with an icon or a label as well as the colour.
    ...status("destructive", "red"),
    ...status("success", "green"),
    ...status("warning", "amber"),
    ...status("info", "blue"),
    // Signed values.
    ["gain", shade(theme.signed.gain)],
    ["loss", shade(theme.signed.loss)],
    ...selection,
    // The environment banner.
    ...banner(theme, "env-dev", "green"),
    ...banner(theme, "env-qa", "amber"),
    ...banner(theme, "env-prod", "red"),
    // Data: chart series in order, a sequential scale and a diverging scale.
    ...charts(theme),
  ]);
}

/** Every token's name, the same in every theme, for code that reads tokens at run time, such as parallax's
 * canvases. */
const tokenNames: readonly string[] = Object.keys(tokensOf(defaultTheme));

export { tokenNames, tokensOf };
export type { Source, Token };
