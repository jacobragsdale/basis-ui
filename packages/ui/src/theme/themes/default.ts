// The default theme, which sits at `:root`. Change a value here, run `vp run @basis/ui#theme` to regenerate
// `src/styles/theme.css`, and let the theme's tests say whether the result still passes.

import { defineTheme } from "#theme/inputs.ts";
import type { StepTone } from "#theme/inputs.ts";

/** The twelve steps every hue shares here, so a step means the same thing on every ramp. Light solids are dark enough
 * for white text, and dark solids light enough for dark text, so a solid is also readable as text on its mode's
 * surfaces. Chroma is quiet on backgrounds, full on solids and slightly calmer on text. */
const curve: readonly StepTone[] = [
  // Steps 1 and 2: page backgrounds.
  { chromaShare: 0.04, dark: 0.178, light: 0.993, step: 1 },
  { chromaShare: 0.08, dark: 0.213, light: 0.981, step: 2 },
  // Steps 3 to 5: control fills at rest, hovered and pressed.
  { chromaShare: 0.16, dark: 0.252, light: 0.958, step: 3 },
  { chromaShare: 0.24, dark: 0.283, light: 0.935, step: 4 },
  { chromaShare: 0.32, dark: 0.312, light: 0.91, step: 5 },
  // Steps 6 to 8: borders. Step 8 is the darkest and clears 3:1 against the page, for control outlines and rings.
  { chromaShare: 0.4, dark: 0.348, light: 0.87, step: 6 },
  { chromaShare: 0.52, dark: 0.42, light: 0.79, step: 7 },
  { chromaShare: 0.72, dark: 0.56, light: 0.62, step: 8 },
  // Steps 9 and 10: solid fills.
  { chromaShare: 1, dark: 0.74, light: 0.47, step: 9 },
  { chromaShare: 1, dark: 0.79, light: 0.42, step: 10 },
  // Steps 11 and 12: text.
  { chromaShare: 0.82, dark: 0.8, light: 0.47, step: 11 },
  { chromaShare: 0.45, dark: 0.95, light: 0.24, step: 12 },
];

const theme = defineTheme({
  /** Chart series in their fixed order: blue, orange, aqua, yellow, green, magenta, violet, red. They are a validated
   * reference palette with its fifth and sixth slots swapped, the order closest to it in which every adjacent pair
   * stays apart under protanopia, deuteranopia and tritanopia alike, in both modes. */
  charts: {
    categorical: [
      { dark: "#3987e5", light: "#2a78d6" },
      { dark: "#d95926", light: "#eb6834" },
      { dark: "#199e70", light: "#1baf7a" },
      { dark: "#c98500", light: "#eda100" },
      { dark: "#008300", light: "#008300" },
      { dark: "#d55181", light: "#e87ba4" },
      { dark: "#9085e9", light: "#6250d6" },
      { dark: "#e66767", light: "#e34948" },
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
  focus: { offset: "0px", width: "2px" },
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
    amber: { chroma: 0.17, curve, hue: 65 },
    blue: { chroma: 0.16, curve, hue: 245 },
    /** The firm's brand: the main action, focus rings and selections. A sober blue until the firm's own replaces it. */
    brand: { chroma: 0.17, curve, hue: 258 },
    green: { chroma: 0.16, curve, hue: 150 },
    /** Surfaces, borders and text: a cool grey with a faint tint. */
    neutral: { chroma: 0.014, curve, hue: 255 },
    red: { chroma: 0.2, curve, hue: 25 },
  },
  motion: { control: "120ms", panel: "150ms", popup: "100ms" },
  name: "default",
  overlay: 0.7,
  /** Past step 10 in light mode and dark, where the ramp has no step left for a fill. */
  pressed: { dark: 0.84, hue: "brand", light: 0.37 },
  radius: { base: "0.375rem", scale: { lg: 1, md: 0.8, sm: 0.6, xl: 1.4 } },
  shadows: {
    dark: {
      floating: "0 2px 6px -1px oklch(0 0 0 / 0.1)",
      raised: "0 1px 2px 0 oklch(0 0 0 / 0.06)",
    },
    light: {
      floating: "0 2px 6px -1px oklch(0 0 0 / 0.1)",
      raised: "0 1px 2px 0 oklch(0 0 0 / 0.06)",
    },
  },
  signed: {
    gain: { dark: 0.84, hue: "green", light: 0.47 },
    loss: { dark: 0.7, hue: "red", light: 0.36 },
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
