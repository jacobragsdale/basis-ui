// What a theme is made of: `ThemeInputs`, the one file of values each theme is, and `defineTheme`, which checks one.
// The generator in `css.ts` turns themes into `src/styles/theme.css`; each theme's inputs are a file in `themes/`.

import type { Density } from "./preferences.ts";

type Mode = "light" | "dark";

/** A ramp's steps, numbered as in the design, and each one's job. Every hue's ramp has them all, so a step means the
 * same thing on every ramp and in every theme. */
const stepJobs = {
  1: "page background",
  2: "page background",
  3: "control fill at rest",
  4: "control fill hovered",
  5: "control fill pressed",
  6: "border",
  7: "border",
  8: "border that clears 3:1, for control outlines and rings",
  9: "solid fill",
  10: "solid fill hovered",
  11: "text",
  12: "text",
} as const;

type Step = keyof typeof stepJobs;

/** One step of a ramp: its OKLCH lightness in each mode, and its chroma as a share of its hue's. */
interface StepTone {
  readonly step: Step;
  readonly light: number;
  readonly dark: number;
  readonly chromaShare: number;
}

/** The text on a solid fill: white, or the page's darkest neutral. */
type Ink = "dark" | "white";

/** A hue in OKLCH: its angle in degrees, the chroma its solid steps reach, and its ramp's curve, the twelve steps in
 * order. Each hue has a curve of its own, so a bright hue need not sit at the lightness of a dark one: amber's solid,
 * a banner's fill, can be the colour of amber, with dark text on it, while its text step stays dark enough to read.
 * `ink` is the text on its solid steps in each mode: white in light mode and dark in dark mode unless it says
 * otherwise. */
interface Hue {
  readonly hue: number;
  readonly chroma: number;
  readonly curve: readonly StepTone[];
  readonly ink?: Readonly<Partial<Record<Mode, Ink>>>;
}

/** The six hues every theme's ramps are built from: the neutral, the brand and four status hues. */
type HueName = "amber" | "blue" | "brand" | "green" | "neutral" | "red";

/** A lightness on a hue in each mode, for a token that sits between a ramp's steps. */
interface Shade {
  readonly hue: HueName;
  readonly light: number;
  readonly dark: number;
}

/** Where each surface sits on the neutral's ramp in one mode: the elevation steps. A fill sits above every surface it
 * can land on, and a secondary fill hovered and pressed each a step further from the page. The veil behind a dialog is
 * the page's step. */
interface Surfaces {
  readonly background: Step;
  readonly card: Step;
  readonly popover: Step;
  readonly muted: Step;
  readonly secondary: Step;
  readonly secondaryHover: Step;
  readonly secondaryActive: Step;
  readonly accent: Step;
  readonly sidebar: Step;
  readonly sidebarAccent: Step;
}

/** The sequential scale's steps, from near zero to the largest value. */
type SequentialName =
  | "seq-1"
  | "seq-2"
  | "seq-3"
  | "seq-4"
  | "seq-5"
  | "seq-6"
  | "seq-7"
  | "seq-8"
  | "seq-9";

/** The diverging scale's steps below its midpoint, from the low end; each has its twin as far above it. */
type DivergingArmName = "div-1" | "div-2" | "div-3" | "div-4" | "div-5";

/** A categorical chart colour in each mode, as CSS. */
interface ChartColour {
  readonly light: string;
  readonly dark: string;
}

/** The chart palettes. Their lengths are fixed, since every theme declares the same tokens: eight series, nine
 * sequential steps, and five steps on each arm of the diverging scale. */
interface Charts {
  /** `chart-1` to `chart-8`, in their fixed order. */
  readonly categorical: readonly [
    ChartColour,
    ChartColour,
    ChartColour,
    ChartColour,
    ChartColour,
    ChartColour,
    ChartColour,
    ChartColour,
  ];
  /** `seq-1` to `seq-9` on one hue, from near zero to the largest value: each step's lightness in light mode. In dark
   * mode the scale runs the other way, so values near zero recede into the page in both: a step's two lightnesses add
   * up to `mirror`. */
  readonly sequential: {
    readonly hue: HueName;
    readonly lightness: Readonly<Record<SequentialName, number>>;
    readonly mirror: number;
  };
  /** `div-1` to `div-11`: `low` below the midpoint, `high` above, and a neutral step at it, `div-6`. Each lightness, of
   * `div-1` to `div-5` from the low end toward the midpoint, is also that of the step as far above it, `div-11` to
   * `div-7`, in light mode; dark mode mirrors it as the sequential scale does. */
  readonly diverging: {
    readonly low: HueName;
    readonly high: HueName;
    readonly lightness: Readonly<Record<DivergingArmName, number>>;
    readonly mirror: number;
    readonly midpoint: Readonly<Record<Mode, Step>>;
  };
}

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

/** The type scale's steps, which the components and parallax's canvases read as `text-*` and `--text-*`. */
type TypeStep = "2xs" | "xs" | "sm" | "base" | "lg" | "xl" | "2xl";

/** A step of the type scale: its font size and its line height, as CSS. */
interface TypeSize {
  readonly size: string;
  readonly lineHeight: string;
}

/** The corner radii that derive from the base radius. */
type RadiusName = "sm" | "md" | "lg" | "xl";

/** Everything one theme sets. Every theme declares the same tokens and variables, so a theme is these values and no
 * code: the generator decides what each one becomes. */
interface ThemeInputs {
  /** The theme's name: its file's, and the `data-theme` value that selects it. The default theme sits at `:root`. */
  readonly name: string;
  /** The hues, each with its ramp's curve. The neutral's chroma is its tint, and its curve the surfaces'. */
  readonly hues: Readonly<Record<HueName, Hue>>;
  /** Where each surface sits on the neutral's ramp, in each mode. */
  readonly surfaces: Readonly<Record<Mode, Surfaces>>;
  /** A primary fill pressed, on the brand: as far again past its hovered step as that is past rest. */
  readonly pressed: Shade;
  /** The alpha of the veil behind a dialog, a sheet or a drawer, which lets the page show through. */
  readonly overlay: number;
  /** Signed values. Loss sits well below gain in lightness, so the two stay apart for readers who cannot tell red
   * from green. */
  readonly signed: { readonly gain: Shade; readonly loss: Shade };
  /** The chart palettes. */
  readonly charts: Charts;
  /** Font stacks: text, code, and the face with tabular figures that a canvas draws numbers in. */
  readonly fonts: { readonly sans: string; readonly mono: string; readonly num: string };
  /** The type scale. */
  readonly type: Readonly<Record<TypeStep, TypeSize>>;
  /** The base corner radius, and each named radius as a multiple of it. */
  readonly radius: { readonly base: string; readonly scale: Readonly<Record<RadiusName, number>> };
  /** The spacing unit at each density. Every Tailwind spacing utility is a multiple of it. */
  readonly spacing: Readonly<Record<Density, string>>;
  /** Each density's control lengths, in whole pixels. Every height is at least WCAG 2.2's 24-pixel target. */
  readonly controls: Readonly<Record<Density, Readonly<Record<ControlSizeName, ControlSize>>>>;
  /** The two shadows in each mode: a control raised off its surface, such as an active tab, and a popup floating over
   * the page. */
  readonly shadows: Readonly<Record<Mode, { readonly raised: string; readonly floating: string }>>;
  /** The focus ring, an outline in the `ring` colour: its width, and its gap from the control's edge. */
  readonly focus: { readonly width: string; readonly offset: string };
  /** How long a transition runs: a control's colours, a popup's fade and scale, and a panel that slides. Reduced
   * motion, the user's or the operating system's, stops them all in every theme. */
  readonly motion: { readonly control: string; readonly popup: string; readonly panel: string };
  /** How far a disabled control fades, as an opacity. */
  readonly disabled: string;
}

/** A theme's name goes into a selector and a file name, so it is lower case words joined by hyphens. */
const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** Checks a theme's inputs where their types cannot, and returns them. Each file in `themes/` exports its theme
 * through it. */
function defineTheme(inputs: ThemeInputs): ThemeInputs {
  if (!namePattern.test(inputs.name)) {
    throw new TypeError(
      `The theme name "${inputs.name}" must be lower case words joined by hyphens, such as "high-contrast": it becomes a data-theme value and a file name.`,
    );
  }
  const stepCount = Object.keys(stepJobs).length;
  for (const [name, { curve }] of Object.entries(inputs.hues)) {
    const inOrder = curve.every((tone, index) => tone.step === index + 1);
    if (!inOrder || curve.length !== stepCount) {
      const numbers = curve.map((tone) => tone.step).join(", ");
      throw new RangeError(
        `The ${inputs.name} theme's ${name} curve has steps ${numbers}; it needs each of 1 to ${String(stepCount)}, once and in order.`,
      );
    }
  }
  return inputs;
}

export { defineTheme };
export type {
  ChartColour,
  Charts,
  ControlSize,
  ControlSizeName,
  DivergingArmName,
  Hue,
  HueName,
  Ink,
  Mode,
  RadiusName,
  SequentialName,
  Shade,
  Step,
  StepTone,
  Surfaces,
  ThemeInputs,
  TypeSize,
  TypeStep,
};
