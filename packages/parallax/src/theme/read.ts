/* Reading the tokens in effect for an element, as a canvas draws with them. */

import { mapValues } from "@basis/ui/utils";

import { chartColors } from "./charts.ts";
import type { ChartColors } from "./charts.ts";
import { tokenNames } from "./define.ts";
import { specs } from "./tokens.ts";
import type { ResolvedScheme, TokenSpec } from "./kinds.ts";
import type { TokenName } from "./tokens.ts";

/** The tokens in effect for one component, as the canvas draws with them, with `font` made of the size and the
 * family, and whether that font had loaded when they were read. */
type Theme = Readonly<Record<TokenName, string>> & {
  readonly font: string;
  /** Whether `font`'s face had loaded. A canvas draws and measures in a fallback face until it has, so text measured
   * before it loaded is measured again once it has. */
  readonly fontLoaded: boolean;
};

/** A token's default as a plain value, for drawing before the stylesheet applies: a default derived from other tokens
 * gives the value it registers with, which is the light scheme's. */
function plain(entry: TokenSpec, scheme: ResolvedScheme): string {
  return entry.initial ?? entry[scheme];
}

/** Whether `font`'s face has loaded in `fonts`, starting to load it if not. The watcher of the page reads the tokens
 * again when it arrives. */
function loaded(fonts: FontFaceSet, font: string): boolean {
  if (fonts.check(font, "0")) {
    return true;
  }
  fonts.load(font, "0").catch(() => {
    // A face that fails to load leaves the fallback, which the canvas already draws in.
  });
  return false;
}

/** A theme of every token, from a value for each, and whether its font has loaded in `fonts`, which starts loading
 * it if not: a canvas never asks for a face until it draws, and a face asked for by the first frame arrives after it.
 * Without `fonts`, the font counts as loaded. */
function themeOf(value: (name: TokenName) => string, fonts?: FontFaceSet): Theme {
  const tokens = mapValues(specs, (_spec, name) => value(name));
  const font = `${tokens.fontSize} ${tokens.fontFamily}`;
  return { ...tokens, font, fontLoaded: fonts === undefined || loaded(fonts, font) };
}

/** The defaults of a scheme as plain values, as `readTheme` returns them before the stylesheet applies. */
function defaultTheme(scheme: ResolvedScheme): Theme {
  return themeOf((name) => plain(specs[name], scheme));
}

/** The scheme `element` is drawn in, from the nearest host's `data-px-scheme`. */
function schemeOf(element: Element): ResolvedScheme {
  return element.closest<HTMLElement>("[data-px-scheme]")?.dataset["pxScheme"] === "dark"
    ? "dark"
    : "light";
}

/** Reads the tokens in effect for `element`, a host or an element inside one. */
function readTheme(element: Element): Theme {
  const style = getComputedStyle(element);
  const scheme = schemeOf(element);
  return themeOf((name) => {
    const entry = specs[name];
    const value = style.getPropertyValue(`--_px-${entry.property}`).trim();
    return value === "" ? plain(entry, scheme) : value;
  }, element.ownerDocument.fonts);
}

/** Reads the chart colours in effect for `element`, falling back to its scheme's defaults. */
function readChartColors(element: Element): ChartColors {
  const style = getComputedStyle(element);
  const fallback = chartColors[schemeOf(element)];
  const read = (property: string, otherwise: string): string => {
    const value = style.getPropertyValue(`--_px-${property}`).trim();
    return value === "" ? otherwise : value;
  };
  const list = (name: string, values: readonly string[]): readonly string[] =>
    values.map((value, index) => read(`${name}-${String(index + 1)}`, value));
  return {
    down: read("down", fallback.down),
    middle: read("middle", fallback.middle),
    negativeRamp: list("negative-ramp", fallback.negativeRamp),
    ramp: list("ramp", fallback.ramp),
    series: list("series", fallback.series),
    up: read("up", fallback.up),
  };
}

/** Whether two sets of tokens are the same, so that a change that alters none redraws nothing. */
function sameTheme(first: Theme, second: Theme): boolean {
  return (
    first.font === second.font &&
    first.fontLoaded === second.fontLoaded &&
    tokenNames.every((name) => first[name] === second[name])
  );
}

/** Whether two sets of chart colours are the same. */
function sameChartColors(first: ChartColors, second: ChartColors): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export { defaultTheme, readChartColors, readTheme, sameChartColors, sameTheme };
export type { Theme };
