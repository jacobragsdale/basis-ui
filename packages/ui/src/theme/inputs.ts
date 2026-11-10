// The theme's inputs. Porting the firm's own theme means changing these values, then running
// `vp run @basis/ui#theme` to regenerate `src/styles/theme.css`; the theme's tests say whether the result still passes.

/** A hue in OKLCH: its angle in degrees, and the chroma its solid steps reach. */
interface Hue {
  readonly hue: number;
  readonly chroma: number;
}

/** The six hues the theme's ramps are built from. */
const hues = {
  amber: { chroma: 0.17, hue: 65 },
  blue: { chroma: 0.16, hue: 245 },
  /** The firm's brand: the main action, focus rings and selections. A sober blue until the firm's own replaces it. */
  brand: { chroma: 0.17, hue: 258 },
  green: { chroma: 0.16, hue: 150 },
  /** Surfaces, borders and text: a cool grey with a faint tint. */
  neutral: { chroma: 0.014, hue: 255 },
  red: { chroma: 0.2, hue: 25 },
} as const satisfies Record<string, Hue>;

type HueName = keyof typeof hues;

/** The base corner radius; Tailwind's radius scale derives from it. */
const radius = "0.375rem";

/** Font stacks. Both faces are bundled with `@basis/ui`, so text renders alike on every desktop. */
const fonts = {
  mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  /** The sans face with tabular figures as its default, for text a canvas draws, such as parallax's grids and axes: a
   * canvas's font cannot ask for `tabular-nums`, so `--font-num` names a face that has them on. The DOM's numbers keep
   * the sans stack and ask with `tabular-nums`. */
  num: '"Inter Tabular", "Inter Variable", ui-sans-serif, system-ui, sans-serif',
  sans: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
} as const;

/** The spacing unit at each density. Every Tailwind spacing utility is a multiple of it, so the layout's gaps and
 * paddings shrink by a quarter in the compact density; a control's own lengths are `controls`, in whole pixels. */
const spacing = {
  comfortable: "0.25rem",
  compact: "0.1875rem",
} as const;

/** A control size's lengths, in CSS pixels: its height, its horizontal padding, the padding on the side an icon sits,
 * which is less so that the icon looks as far from the edge as the text does, its icons' size, and the gap between an
 * icon and its text. */
interface ControlSize {
  readonly height: number;
  readonly inset: number;
  readonly insetBesideIcon: number;
  readonly icon: number;
  readonly gap: number;
}

/** The control sizes: `xs` and `sm` set their text at `text-xs`, `md` and `lg` at `text-sm`. */
type ControlSizeName = "xs" | "sm" | "md" | "lg";

/** Each density's control sizes, in whole pixels, where a multiple of the compact density's 3-pixel unit would fall
 * between them, and where Button's sizes would meet at the 24-pixel target. Every height is at least `targetSize`, and
 * each size is taller than the one before it. An icon is at least 0.873 em, the font size at which lucide's glyph,
 * drawn in 20 of its 24 units, reaches Inter's capitals, 0.727 em tall: 12 pixels beside `text-xs`, 14 beside
 * `text-sm`. */
const controls = {
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
} as const satisfies Record<"comfortable" | "compact", Record<ControlSizeName, ControlSize>>;

/** The smallest a control may be, across and down: WCAG 2.2's minimum target size, 24 CSS pixels. It is a fixed length
 * rather than a multiple of the spacing unit, so the compact density cannot shrink it. It gives `min-h-target` and
 * `min-w-target`, which every control that could be shorter carries. */
const targetSize = "1.5rem";

/** The focus ring, an outline in the `ring` colour: its width, and its gap from the control's edge. An outline's gap
 * is transparent, so it shows the surface under it on any surface, and Windows' forced colours keep it. */
const focusRing = {
  offset: "0px",
  width: "2px",
} as const;

/** The two shadows: a control raised off its surface, such as an active tab, and a popup floating over the page. */
const shadows = {
  floating: "0 2px 6px -1px oklch(0 0 0 / 0.1)",
  raised: "0 1px 2px 0 oklch(0 0 0 / 0.06)",
} as const;

/** How long a transition runs: a control's colours, a popup's fade and scale, and a panel that slides. */
const durations = {
  control: "120ms",
  panel: "150ms",
  popup: "100ms",
} as const;

/** The stacking order: a part raised over its siblings, such as a focused button in a group, and a popup or the veil
 * behind a dialog, over the page. */
const layers = {
  popup: "50",
  raised: "10",
} as const;

/** The radius of a pill, such as a badge or a switch's track: a half-circle at each end, whatever its length. */
const pillRadius = "9999px";

/** How far a disabled control fades, as an opacity. */
const disabledOpacity = "50%";

export {
  controls,
  disabledOpacity,
  durations,
  focusRing,
  fonts,
  hues,
  layers,
  pillRadius,
  radius,
  shadows,
  spacing,
  targetSize,
};
export type { ControlSize, ControlSizeName, Hue, HueName };
