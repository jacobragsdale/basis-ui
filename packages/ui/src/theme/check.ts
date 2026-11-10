// `checkTheme`: what every theme must hold, measured on its inputs, and for each failure the nearest value of one input
// that passes (levers.ts). A pure function with no Node API, so the gallery's studio can run it in the page as the
// inputs change. The repo's `vp check` runs it on every shipped theme, through the lint rule in
// scripts/check-themes-plugin.ts.

import {
  blend,
  converter,
  differenceEuclidean,
  filterDeficiencyDeuter,
  filterDeficiencyProt,
  filterDeficiencyTrit,
  wcagContrast,
} from "culori";
import type { Color } from "culori";

import { colourOf } from "./colours.ts";
import type { Mode, ThemeInputs } from "./inputs.ts";
import { fixOf, leverOf } from "./levers.ts";
import type { Lever } from "./levers.ts";
import {
  fills,
  grounds,
  outlinePairs,
  ownPairs,
  ringPairs,
  states,
  surfaces,
  texts,
} from "./pairs.ts";

/** One thing a theme fails: its mode, the two tokens measured, the one a fix moves first, and the line to show. */
interface ThemeProblem {
  readonly theme: string;
  readonly mode: Mode;
  readonly tokens: readonly [moved: string, against: string];
  /** One line that starts with `ERROR`, gives the token, the pair and the figure, and ends with the nearest value of
   * one input that passes. */
  readonly message: string;
}

/** A check's floor, and what needs it, for the failure to say. */
interface Floor {
  readonly minimum: number;
  readonly need: string;
}

/* WCAG 2.2's contrast for text, raised from 4.5:1 to 5.5:1 for the dimmed, compressed screens of a Citrix session; and
 * its 3:1 for what is not text (1.4.11): a control's outline, a focus ring and a chart's marks. */
const text: Floor = { minimum: 5.5, need: "text needs" };
const outline: Floor = { minimum: 3, need: "a control's outline needs" };
const ring: Floor = { minimum: 3, need: "a focus ring needs" };
const marks: Floor = { minimum: 3, need: "a chart's marks need" };

/* OKLab distance times 100. 2 is about one just-noticeable difference: enough for a quiet fill to show. */
const fill: Floor = { minimum: 2, need: "a fill needs to show" };
const hovered: Floor = { minimum: 2, need: "a hovered fill needs to show" };
const pressed: Floor = { minimum: 2, need: "a pressed fill needs to show" };

/* The chart series' floors, in OKLab distance times 100 under Machado, Oliveira and Fernandes' 2009 simulation at
 * severity 1, as culori implements it. They are those of the validator of the reference palette the default's series
 * come from, calibrated to that simulation: 15 between neighbours to normal vision, 8 under each simulation, and 6
 * between any two series, its floor where something besides colour also tells series apart, since parallax's charts
 * always carry a legend and a tooltip, and a scatter or a heatmap puts any two series side by side. */
const neighbours: Floor = { minimum: 15, need: "neighbouring series need" };
const simulatedNeighbours: Floor = { minimum: 8, need: "neighbouring series need" };
const anyPair: Floor = { minimum: 6, need: "any two series need" };
const signedApart: Floor = { minimum: 8, need: "signed values need" };

/** `gain` and `loss` differ in lightness by this much, so a reader who cannot tell red from green still can. */
const signedLightness = 0.1;

/** The decimal places a figure is stated with: a contrast's, a distance's and a lightness's. */
const places = { contrast: 2, distance: 1, lightness: 2 } as const;
const decimalBase = 10;

const modes: readonly Mode[] = ["light", "dark"];
const distance = differenceEuclidean("oklab");
const toOklch = converter("oklch");

/** Colour vision under each simulation. */
const visions = [
  ["deuteranopia", filterDeficiencyDeuter(1)],
  ["protanopia", filterDeficiencyProt(1)],
  ["tritanopia", filterDeficiencyTrit(1)],
] as const;
type Vision = (typeof visions)[number];

/** OKLab distance times 100, the scale the floors use, under a simulation if given. */
function delta(first: Color, second: Color, vision?: Vision): number {
  const simulate = vision?.[1] ?? ((colour: Color): Color => colour);
  return distance(simulate(first), simulate(second)) * 100;
}

/** `top` as drawn over `bottom`: composited in sRGB, as a browser does, when it has an alpha. */
function drawn(top: Color, bottom: Color): Color {
  return (top.alpha ?? 1) >= 1 ? top : blend([bottom, top], "normal");
}

function contrast(top: Color, bottom: Color): number {
  return wcagContrast(drawn(top, bottom), bottom);
}

/** A figure as a failure states it, cut rather than rounded, so that 5.497 never reads as the 5.5 it misses. */
function figure(value: number, decimals: number): string {
  const scale = decimalBase ** decimals;
  return (Math.floor(value * scale) / scale).toFixed(decimals);
}

/** How a distance check reads: `pair` names the two tokens as a pair, `against` first, and `vision` simulates. */
interface Apart extends Floor {
  readonly pair?: boolean;
  readonly vision?: Vision;
}

/** The checks of one theme in one mode, and the problems they find. */
class ModeCheck {
  public readonly problems: ThemeProblem[] = [];
  readonly #theme: ThemeInputs;
  readonly #mode: Mode;

  public constructor(theme: ThemeInputs, mode: Mode) {
    this.#theme = theme;
    this.#mode = mode;
  }

  public colour(name: string): Color {
    return colourOf(this.#theme, name, this.#mode);
  }

  public lever(name: string): Lever | undefined {
    return leverOf(this.#theme, name, this.#mode);
  }

  public report(tokens: readonly [string, string], what: string, fix: string): void {
    this.problems.push({
      message: `ERROR the ${this.#theme.name} theme's ${this.#mode} ${what}: ${fix}.`,
      mode: this.#mode,
      theme: this.#theme.name,
      tokens,
    });
  }

  /** `top` on `bottom` reaches the floor; the fix moves `top`, or `bottom` when no input moves `top`. */
  public contrast(top: string, bottom: string, { minimum, need }: Floor): void {
    const topColour = this.colour(top);
    const bottomColour = this.colour(bottom);
    const measured = contrast(topColour, bottomColour);
    if (measured >= minimum) {
      return;
    }
    const fix = fixOf(
      [this.lever(top), this.lever(bottom)],
      (colour, lever) =>
        lever === 0 ? contrast(colour, bottomColour) : contrast(topColour, colour),
      {
        passes: (value) => value >= minimum,
        shown: (value) => `${figure(value, places.contrast)}:1`,
      },
    );
    const ratio = `${figure(measured, places.contrast)}:1`;
    this.report(
      [top, bottom],
      `${top} on ${bottom} is ${ratio}, under the ${String(minimum)}:1 ${need}`,
      fix,
    );
  }

  /** `moved` stands the floor apart from `against` in OKLab; the fix moves `moved`. */
  public apart(moved: string, against: string, { minimum, need, pair, vision }: Apart): void {
    const fixed = this.colour(against);
    const measured = delta(this.colour(moved), fixed, vision);
    if (measured >= minimum) {
      return;
    }
    const fix = fixOf([this.lever(moved)], (colour) => delta(colour, fixed, vision), {
      passes: (value) => value >= minimum,
      shown: (value) => figure(value, places.distance),
    });
    const [first, second] = pair === true ? [against, moved] : [moved, against];
    const under = vision === undefined ? "" : ` under ${vision[0]}`;
    this.report(
      [moved, against],
      `${first} and ${second} are ${figure(measured, places.distance)} apart in OKLab ×100${under}, under the ${String(minimum)} ${need}`,
      fix,
    );
  }
}

function checkContrast(check: ModeCheck): void {
  for (const name of texts) {
    for (const ground of grounds) {
      check.contrast(name, ground, text);
    }
  }
  for (const [name, own] of ownPairs) {
    check.contrast(name, own, text);
  }
  for (const [name, surface] of outlinePairs) {
    check.contrast(name, surface, outline);
  }
  for (const [name, surface] of ringPairs) {
    check.contrast(name, surface, ring);
  }
}

function checkFills(check: ModeCheck): void {
  for (const name of fills) {
    for (const surface of surfaces) {
      check.apart(name, surface, fill);
    }
  }
  for (const [rest, hover, active] of states) {
    check.apart(hover, rest, hovered);
    check.apart(active, hover, pressed);
  }
}

/** Each series on what a chart sits on, and against every series before it, to normal vision and under each
 * simulation: a neighbour at the neighbours' floors, any other at `anyPair`. */
function checkCharts(check: ModeCheck, count: number): void {
  const series = Array.from({ length: count }, (_slot, index) => `chart-${String(index + 1)}`);
  for (const [index, later] of series.entries()) {
    for (const surface of surfaces) {
      check.contrast(later, surface, marks);
    }
    for (const [earlierIndex, earlier] of series.slice(0, index).entries()) {
      const next = earlierIndex === index - 1;
      check.apart(later, earlier, { ...(next ? neighbours : anyPair), pair: true });
      for (const vision of visions) {
        check.apart(later, earlier, {
          ...(next ? simulatedNeighbours : anyPair),
          pair: true,
          vision,
        });
      }
    }
  }
}

function checkSigned(check: ModeCheck): void {
  const gain = toOklch(check.colour("gain")).l;
  const apart = Math.abs(gain - toOklch(check.colour("loss")).l);
  if (apart < signedLightness) {
    const fix = fixOf([check.lever("loss")], (colour) => Math.abs(gain - toOklch(colour).l), {
      passes: (value) => value >= signedLightness,
      shown: (value) => figure(value, places.lightness),
    });
    check.report(
      ["loss", "gain"],
      `gain and loss differ by ${figure(apart, places.lightness)} in lightness, under the ${String(signedLightness)} that tells them apart without hue`,
      fix,
    );
  }
  for (const vision of visions) {
    check.apart("loss", "gain", { ...signedApart, pair: true, vision });
  }
}

/** Everything `theme` fails, in both modes: text on what it sits on, outlines and focus rings, fills and their states,
 * the chart series, and gain and loss. An empty list is a pass. */
function checkTheme(theme: ThemeInputs): readonly ThemeProblem[] {
  return modes.flatMap((mode) => {
    const check = new ModeCheck(theme, mode);
    checkContrast(check);
    checkFills(check);
    checkCharts(check, theme.charts.categorical.length);
    checkSigned(check);
    return check.problems;
  });
}

/** What the theme in `file`, a path whose last part is its name, fails among `shipped`, as lines: a file `themes` does
 * not list is a problem of its own, since neither the stylesheet nor this check would see it. */
function themeFileProblems(file: string, shipped: readonly ThemeInputs[]): readonly string[] {
  const name = file.replace(/^.*[/\\]/u, "").replace(/\.[^.]+$/u, "");
  const theme = shipped.find((candidate) => candidate.name === name);
  return theme === undefined
    ? [
        `ERROR ${name}.ts defines a theme that \`themes\` in src/theme/themes/index.ts does not list, so it is in no stylesheet and no check: add it there, or name the theme after its file.`,
      ]
    : checkTheme(theme).map(({ message }) => message);
}

export { checkTheme, themeFileProblems };
export type { ThemeProblem };
