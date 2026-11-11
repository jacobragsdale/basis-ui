// The desk theme, under data-theme="desk": dense and dark-first, for desks that live in the grid all day. Its dark
// mode is the one it is designed for, a graphite with little tint and a teal brand that reads against the grid's
// numbers; its light mode is a dim one, a grey page rather than a white glare. Its type is a step smaller than the
// default's, its corners tighter and its shadows almost none, so more rows and more figures fit. Change a value here
// and run `vp run @basis/ui#theme`; `vp check` reports at this file whatever fails `checkTheme`.

import { defineTheme } from "#theme/inputs.ts";
import type { Step, StepTone } from "#theme/inputs.ts";

/** The twelve steps the status hues share here, as the default's: step 9 a banner's fill, step 11 the text, which is
 * also a status's fill under white text in light mode. Dark mode's backgrounds sit lower than the default's. */
const curve: readonly StepTone[] = [
  // Steps 1 and 2: page backgrounds.
  { chromaShare: 0.04, dark: 0.16, light: 0.98, step: 1 },
  { chromaShare: 0.1, dark: 0.19, light: 0.965, step: 2 },
  // Steps 3 to 5: control fills at rest, hovered and pressed; a status's tint.
  { chromaShare: 0.22, dark: 0.24, light: 0.94, step: 3 },
  { chromaShare: 0.3, dark: 0.275, light: 0.918, step: 4 },
  { chromaShare: 0.38, dark: 0.305, light: 0.895, step: 5 },
  // Steps 6 to 8: borders. Step 8 is the darkest and clears 3:1 against the page, for control outlines and rings.
  { chromaShare: 0.44, dark: 0.36, light: 0.87, step: 6 },
  { chromaShare: 0.56, dark: 0.43, light: 0.79, step: 7 },
  { chromaShare: 0.76, dark: 0.57, light: 0.62, step: 8 },
  // Steps 9 and 10: solid fills.
  { chromaShare: 1, dark: 0.7, light: 0.5, step: 9 },
  { chromaShare: 1, dark: 0.75, light: 0.45, step: 10 },
  // Steps 11 and 12: text.
  { chromaShare: 0.9, dark: 0.8, light: 0.47, step: 11 },
  { chromaShare: 0.5, dark: 0.95, light: 0.24, step: 12 },
];

/** `curve` with some steps at other lightnesses, for a hue that WCAG's contrast weighs otherwise than OKLCH's
 * lightness, or whose solid is meant to be light. */
function curveWith(
  changes: Readonly<
    Partial<Record<Step, Partial<Pick<StepTone, "chromaShare" | "dark" | "light">>>>
  >,
): readonly StepTone[] {
  return curve.map(({ chromaShare, dark, light, step }) => {
    const change = changes[step];
    return {
      chromaShare: change?.chromaShare ?? chromaShare,
      dark: change?.dark ?? dark,
      light: change?.light ?? light,
      step,
    };
  });
}

/** The neutral's own steps: a graphite with a trace of blue. Dark mode's page is near black and each surface above it
 * a small step lighter, so a grid's rules and a popup's edge carry the elevation; light mode's page is a mid grey with
 * its cards a step above it, nothing white. */
const neutral: readonly StepTone[] = [
  { chromaShare: 0.3, dark: 0.145, light: 0.975, step: 1 },
  { chromaShare: 0.4, dark: 0.175, light: 0.945, step: 2 },
  { chromaShare: 0.45, dark: 0.205, light: 0.922, step: 3 },
  { chromaShare: 0.5, dark: 0.235, light: 0.9, step: 4 },
  { chromaShare: 0.55, dark: 0.265, light: 0.876, step: 5 },
  { chromaShare: 0.6, dark: 0.305, light: 0.84, step: 6 },
  { chromaShare: 0.6, dark: 0.38, light: 0.77, step: 7 },
  { chromaShare: 0.6, dark: 0.545, light: 0.6, step: 8 },
  { chromaShare: 0.6, dark: 0.66, light: 0.5, step: 9 },
  { chromaShare: 0.6, dark: 0.72, light: 0.45, step: 10 },
  { chromaShare: 0.5, dark: 0.77, light: 0.44, step: 11 },
  { chromaShare: 0.4, dark: 0.93, light: 0.2, step: 12 },
];

const theme = defineTheme({
  /** Chart series in their fixed order: blue, orange, aqua, yellow, green, magenta, violet, red. They start from a
   * validated reference palette with its fifth and sixth slots swapped, the order closest to it in which every adjacent
   * pair stays apart under protanopia, deuteranopia and tritanopia alike, in both modes, each moved by the least that
   * passes `checkTheme`: 3:1 on every surface a chart sits on, which takes light yellow to a dark gold, and any two
   * series apart under each simulation, not only neighbours. */
  charts: {
    categorical: [
      { dark: "#3c7dde", light: "#2a78d6" },
      { dark: "#d54f00", light: "#e65b49" },
      { dark: "#2fa172", light: "#0b9b6a" },
      { dark: "#c68610", light: "#bd7a00" },
      { dark: "#008300", light: "#017500" },
      { dark: "#d04782", light: "#bd6797" },
      { dark: "#9188eb", light: "#5d44d4" },
      { dark: "#e96865", light: "#d13f41" },
    ],
    diverging: {
      high: "red",
      lightness: { "div-1": 0.42, "div-2": 0.52, "div-3": 0.62, "div-4": 0.72, "div-5": 0.82 },
      low: "blue",
      midpoint: { dark: 6, light: 4 },
      mirror: 1.24,
    },
    sequential: {
      hue: "blue",
      lightness: {
        "seq-1": 0.93,
        "seq-2": 0.86,
        "seq-3": 0.79,
        "seq-4": 0.72,
        "seq-5": 0.65,
        "seq-6": 0.58,
        "seq-7": 0.51,
        "seq-8": 0.44,
        "seq-9": 0.37,
      },
      mirror: 1.2,
    },
  },
  /** Each density's control sizes, in whole pixels, a little shorter than the default's: every height still clears
   * the 24-pixel target, and each size is taller than the one before it. Beside 11- and 13-pixel text, a 12-pixel icon
   * reaches the capitals. */
  controls: {
    comfortable: {
      xs: { gap: 4, height: 24, icon: 12, inset: 8, insetBesideIcon: 6 },
      sm: { gap: 4, height: 26, icon: 12, inset: 8, insetBesideIcon: 6 },
      md: { gap: 6, height: 28, icon: 14, inset: 10, insetBesideIcon: 8 },
      lg: { gap: 6, height: 32, icon: 14, inset: 10, insetBesideIcon: 8 },
    },
    compact: {
      xs: { gap: 4, height: 24, icon: 12, inset: 6, insetBesideIcon: 4 },
      sm: { gap: 4, height: 25, icon: 12, inset: 6, insetBesideIcon: 4 },
      md: { gap: 4, height: 26, icon: 12, inset: 8, insetBesideIcon: 6 },
      lg: { gap: 6, height: 28, icon: 14, inset: 8, insetBesideIcon: 6 },
    },
  },
  disabled: "50%",
  /** An outline's gap is transparent, so it shows the surface under it on any surface, and Windows' forced colours
   * keep it. */
  focus: { offset: "1px", width: "2px" },
  /** Both faces are bundled with `@basis/ui`, so text renders alike on every desktop. `num` is the sans face with
   * tabular figures as its default, for text a canvas draws, such as parallax's grids and axes: a canvas's font cannot
   * ask for `tabular-nums`, so `--font-num` names a face that has them on. The DOM's numbers keep the sans stack and
   * ask with `tabular-nums`. */
  fonts: {
    mono: '"JetBrains Mono Variable", ui-monospace, monospace',
    num: '"Inter Tabular", "Inter Variable", ui-sans-serif, system-ui, sans-serif',
    sans: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
  },
  hues: {
    /** Amber's solid is amber, with dark text on it, in both modes, as the default's. */
    amber: {
      chroma: 0.17,
      curve: curveWith({
        9: { dark: 0.8, light: 0.8 },
        10: { dark: 0.84, light: 0.76 },
        11: { dark: 0.81, light: 0.45 },
      }),
      hue: 72,
      ink: { light: "dark" },
    },
    blue: { chroma: 0.15, curve: curveWith({ 11: { light: 0.44 } }), hue: 240 },
    /** A teal brand: it stays apart from the blue of `info` and the green of a gain, and reads on a near-black page. In
     * dark mode its solid is light enough for dark text on it. */
    brand: {
      chroma: 0.13,
      curve: curveWith({
        8: { dark: 0.6, light: 0.57 },
        9: { dark: 0.74, light: 0.44 },
        10: { dark: 0.79, light: 0.395 },
        11: { dark: 0.79, light: 0.44 },
      }),
      hue: 195,
    },
    green: { chroma: 0.16, curve: curveWith({ 11: { light: 0.43 } }), hue: 148 },
    neutral: { chroma: 0.018, curve: neutral, hue: 250 },
    red: { chroma: 0.2, curve: curveWith({ 11: { light: 0.45 } }), hue: 22 },
  },
  motion: { control: "120ms", panel: "150ms", popup: "100ms" },
  name: "desk",
  overlay: 0.7,
  /** Past step 10 in light mode and dark, where the ramp has no step left for a fill. */
  pressed: { dark: 0.84, hue: "brand", light: 0.35 },
  /** Tighter corners than the default's, as a grid's cells have none. */
  radius: { base: "0.25rem", scale: { lg: 1, md: 0.75, sm: 0.5, xl: 1.5 } },
  /** Almost no shadow: on a near-black page a shadow barely shows, and the edges carry the elevation. */
  shadows: {
    dark: {
      floating: "0 4px 12px -2px oklch(0 0 0 / 0.6)",
      raised: "0 1px 1px 0 oklch(0 0 0 / 0.4)",
    },
    light: {
      floating: "0 4px 12px -2px oklch(0.25 0.02 250 / 0.2)",
      raised: "0 1px 1px 0 oklch(0.25 0.02 250 / 0.12)",
    },
  },
  signed: {
    gain: { dark: 0.86, hue: "green", light: 0.435 },
    loss: { dark: 0.75, hue: "red", light: 0.33 },
  },
  /** The compact density shrinks the layout's gaps and paddings by a quarter; a control's own lengths are `controls`. */
  spacing: { comfortable: "0.25rem", compact: "0.1875rem" },
  /** As the default's: light mode lifts cards above a grey page; dark mode lifts them by lightness, since shadows barely show on
   * dark surfaces. Dark mode's popover is step 3, so its muted fill is step 4 and its secondary and accent fills 5. */
  surfaces: {
    dark: {
      accent: 5,
      background: 1,
      card: 2,
      muted: 4,
      popover: 3,
      secondary: 5,
      secondaryActive: 7,
      secondaryHover: 6,
      sidebar: 2,
      sidebarAccent: 4,
    },
    light: {
      accent: 4,
      background: 2,
      card: 1,
      muted: 3,
      popover: 1,
      secondary: 4,
      secondaryActive: 6,
      secondaryHover: 5,
      sidebar: 1,
      sidebarAccent: 4,
    },
  },
  /** A step smaller than the default's, in whole pixels: 13-pixel text in controls and cells, 11 in dense labels. */
  type: {
    "2xs": { lineHeight: "0.875rem", size: "0.625rem" },
    xs: { lineHeight: "1rem", size: "0.6875rem" },
    sm: { lineHeight: "1.125rem", size: "0.8125rem" },
    base: { lineHeight: "1.25rem", size: "0.875rem" },
    lg: { lineHeight: "1.5rem", size: "1rem" },
    xl: { lineHeight: "1.75rem", size: "1.125rem" },
    "2xl": { lineHeight: "1.75rem", size: "1.25rem" },
  },
});

export { theme };
