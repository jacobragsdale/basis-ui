// The theme's inputs. Porting the firm's own theme means changing these values, then running
// `vp run @basis/ui#theme` to regenerate `src/styles/theme.css`; the theme's tests say whether the result still passes.

/** A hue in OKLCH: its angle in degrees, and the chroma its solid steps reach. */
export interface Hue {
  readonly hue: number;
  readonly chroma: number;
}

/** The six hues the theme's ramps are built from. */
export const hues = {
  /** Surfaces, borders and text: a cool grey with a faint tint. */
  neutral: { hue: 255, chroma: 0.014 },
  /** The firm's brand: the main action, focus rings and selections. A sober blue until the firm's own replaces it. */
  brand: { hue: 258, chroma: 0.17 },
  red: { hue: 25, chroma: 0.2 },
  amber: { hue: 65, chroma: 0.17 },
  green: { hue: 150, chroma: 0.16 },
  blue: { hue: 245, chroma: 0.16 },
} as const satisfies Record<string, Hue>;

export type HueName = keyof typeof hues;

/** The base corner radius; Tailwind's radius scale derives from it. */
export const radius = "0.375rem";

/** Font stacks. Both faces are bundled with `@basis/ui`, so text renders alike on every desktop. */
export const fonts = {
  sans: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, monospace',
} as const;

/** The spacing unit at each density. Every Tailwind spacing utility and control height is a multiple of it. */
export const spacing = {
  comfortable: "0.25rem",
  compact: "0.1875rem",
} as const;
