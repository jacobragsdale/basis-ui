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
  sans: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
} as const;

/** The spacing unit at each density. Every Tailwind spacing utility and control height is a multiple of it. */
const spacing = {
  comfortable: "0.25rem",
  compact: "0.1875rem",
} as const;

export { fonts, hues, radius, spacing };
export type { Hue, HueName };
