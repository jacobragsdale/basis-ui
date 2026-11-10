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

/** The spacing unit at each density. Every Tailwind spacing utility and control height is a multiple of it. */
const spacing = {
  comfortable: "0.25rem",
  compact: "0.1875rem",
} as const;

/** The smallest a control may be, across and down: WCAG 2.2's minimum target size, 24 CSS pixels. It is a fixed length
 * rather than a multiple of the spacing unit, so the compact density cannot shrink it. It gives `min-h-target` and
 * `min-w-target`, which every control shorter than `h-8` carries. */
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
export type { Hue, HueName };
