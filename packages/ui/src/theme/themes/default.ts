// The default theme, which sits at `:root`. Change a value here, run `vp run @basis/ui#theme` to regenerate
// `src/styles/theme.css`; `vp check` reports at this file whatever fails `checkTheme`, each with the nearest value that
// passes.

import { defineTheme } from "#theme/inputs.ts";
import type { Step, StepTone } from "#theme/inputs.ts";

/** The twelve steps the status hues share here, so a step means the same thing on every ramp. Step 9, the solid, is a
 * banner's fill; step 11, the text, is also a status's fill under white text in light mode, so it is dark enough for
 * both. Chroma is quiet on backgrounds, full on solids and slightly calmer on text. */
const curve: readonly StepTone[] = [
  // Steps 1 and 2: page backgrounds.
  { chromaShare: 0.04, dark: 0.178, light: 0.993, step: 1 },
  { chromaShare: 0.1, dark: 0.213, light: 0.979, step: 2 },
  // Steps 3 to 5: control fills at rest, hovered and pressed; a status's tint.
  { chromaShare: 0.2, dark: 0.26, light: 0.957, step: 3 },
  { chromaShare: 0.28, dark: 0.29, light: 0.934, step: 4 },
  { chromaShare: 0.36, dark: 0.32, light: 0.909, step: 5 },
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

/** The neutral's own steps: surfaces, borders and text. Its tint shows on the surfaces, a cool slate rather than a
 * grey, and its page sits a clear step below the cards on it in light mode, where dark mode lifts each surface by
 * lightness. */
const neutral: readonly StepTone[] = [
  { chromaShare: 0.25, dark: 0.172, light: 1, step: 1 },
  { chromaShare: 0.3, dark: 0.198, light: 0.971, step: 2 },
  { chromaShare: 0.34, dark: 0.232, light: 0.95, step: 3 },
  { chromaShare: 0.38, dark: 0.264, light: 0.928, step: 4 },
  { chromaShare: 0.42, dark: 0.294, light: 0.904, step: 5 },
  { chromaShare: 0.46, dark: 0.336, light: 0.868, step: 6 },
  { chromaShare: 0.5, dark: 0.41, light: 0.795, step: 7 },
  { chromaShare: 0.55, dark: 0.565, light: 0.615, step: 8 },
  { chromaShare: 0.6, dark: 0.68, light: 0.5, step: 9 },
  { chromaShare: 0.6, dark: 0.74, light: 0.45, step: 10 },
  { chromaShare: 0.6, dark: 0.79, light: 0.47, step: 11 },
  { chromaShare: 0.45, dark: 0.955, light: 0.215, step: 12 },
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
      { dark: "#d54f00", light: "#ea5e4c" },
      { dark: "#2fa172", light: "#18a06e" },
      { dark: "#c68610", light: "#c57f00" },
      { dark: "#008300", light: "#018000" },
      { dark: "#d04782", light: "#c870a0" },
      { dark: "#9188eb", light: "#5d44d4" },
      { dark: "#e96865", light: "#d54344" },
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
  /** Each density's control sizes, in whole pixels, where a multiple of the compact density's 3-pixel unit would fall
   * between them, and where Button's sizes would meet at the 24-pixel target. Each size is taller than the one before
   * it. An icon is at least 0.873 em, the font size at which lucide's glyph, drawn in 20 of its 24 units, reaches
   * Inter's capitals, 0.727 em tall: 12 pixels beside `text-xs`, 14 beside `text-sm`. */
  controls: {
    comfortable: {
      xs: { gap: 4, height: 24, icon: 12, inset: 8, insetBesideIcon: 6 },
      sm: { gap: 4, height: 28, icon: 14, inset: 10, insetBesideIcon: 6 },
      md: { gap: 6, height: 32, icon: 16, inset: 10, insetBesideIcon: 8 },
      lg: { gap: 6, height: 36, icon: 16, inset: 10, insetBesideIcon: 8 },
    },
    compact: {
      xs: { gap: 4, height: 24, icon: 12, inset: 6, insetBesideIcon: 4 },
      sm: { gap: 4, height: 26, icon: 12, inset: 8, insetBesideIcon: 6 },
      md: { gap: 4, height: 28, icon: 14, inset: 8, insetBesideIcon: 6 },
      lg: { gap: 6, height: 30, icon: 16, inset: 10, insetBesideIcon: 8 },
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
    /** Amber's solid is the colour of amber, in both modes, with dark text on it: the QA banner is amber, not brown.
     * Its text step leans toward orange, which stays a colour at the darkness text needs. */
    amber: {
      chroma: 0.17,
      curve: curveWith({
        9: { dark: 0.8, light: 0.81 },
        10: { dark: 0.84, light: 0.77 },
        11: { dark: 0.81, light: 0.47 },
      }),
      hue: 68,
      ink: { light: "dark" },
    },
    blue: { chroma: 0.16, curve: curveWith({ 11: { light: 0.46 } }), hue: 245 },
    /** The firm's brand: the main action, focus rings and selections. A deep, saturated blue until the firm's own
     * replaces it; in dark mode a vivid one with dark text on it, rather than a pastel. */
    brand: {
      chroma: 0.2,
      curve: curveWith({
        8: { dark: 0.6, light: 0.605 },
        9: { dark: 0.72, light: 0.475 },
        10: { dark: 0.77, light: 0.43 },
        11: { dark: 0.78, light: 0.47 },
      }),
      hue: 262,
    },
    green: { chroma: 0.16, curve: curveWith({ 11: { light: 0.45 } }), hue: 152 },
    /** Surfaces, borders and text: a cool slate whose tint shows. */
    neutral: { chroma: 0.028, curve: neutral, hue: 255 },
    red: { chroma: 0.21, curve, hue: 25 },
  },
  motion: { control: "120ms", panel: "150ms", popup: "100ms" },
  name: "default",
  overlay: 0.7,
  /** Past step 10 in light mode and dark, where the ramp has no step left for a fill. */
  pressed: { dark: 0.82, hue: "brand", light: 0.385 },
  radius: { base: "0.375rem", scale: { lg: 1, md: 0.8, sm: 0.6, xl: 1.4 } },
  /** Shadows in the neutral's own slate in light mode, and black in dark mode, where a shadow must be deep to show at
   * all. A popup's is two layers: a wide one that lifts it, and a tight one that seats it. */
  shadows: {
    dark: {
      floating: "0 8px 24px -6px oklch(0 0 0 / 0.6), 0 2px 6px -2px oklch(0 0 0 / 0.45)",
      raised: "0 1px 2px 0 oklch(0 0 0 / 0.45)",
    },
    light: {
      floating: "0 8px 24px -6px oklch(0.3 0.03 255 / 0.2), 0 2px 6px -2px oklch(0 0 0 / 0.1)",
      raised: "0 1px 2px 0 oklch(0.3 0.03 255 / 0.1)",
    },
  },
  signed: {
    gain: { dark: 0.86, hue: "green", light: 0.45 },
    loss: { dark: 0.75, hue: "red", light: 0.345 },
  },
  /** The compact density shrinks the layout's gaps and paddings by a quarter; a control's own lengths are `controls`. */
  spacing: { comfortable: "0.25rem", compact: "0.1875rem" },
  /** Light mode lifts cards above a faintly grey page; dark mode lifts them by lightness, since shadows barely show on
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
  /** Tailwind's own steps, and `2xs` below them for axes and dense labels. */
  type: {
    "2xs": { lineHeight: "0.875rem", size: "0.625rem" },
    xs: { lineHeight: "calc(1 / 0.75)", size: "0.75rem" },
    sm: { lineHeight: "calc(1.25 / 0.875)", size: "0.875rem" },
    base: { lineHeight: "calc(1.5 / 1)", size: "1rem" },
    lg: { lineHeight: "calc(1.75 / 1.125)", size: "1.125rem" },
    xl: { lineHeight: "calc(1.75 / 1.25)", size: "1.25rem" },
    "2xl": { lineHeight: "calc(2 / 1.5)", size: "1.5rem" },
  },
});

export { theme };
