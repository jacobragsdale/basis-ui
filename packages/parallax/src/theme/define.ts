/* Themes: values for some tokens, in both schemes or in one, which `defineTheme` makes and a component draws with. A
 * token set above a component in CSS still wins over its theme. */

import { keys } from "@basis/ui/utils";

import type { ChartColors } from "./charts.ts";
import { chartLists, chartSingles } from "./chart-tokens.ts";
import { specs } from "./tokens.ts";
import type { LengthToken, TokenName } from "./tokens.ts";

/** The charts' colours a theme may set, by their names in `ChartColors`. */
type ChartParams = { readonly [TKey in keyof ChartColors]?: ChartColors[TKey] };

/** A theme's values for some tokens: colours as CSS colours, lengths as CSS lengths or numbers of pixels. */
type ThemeParams = {
  readonly [TName in TokenName]?: TName extends LengthToken ? string | number : string;
} & ChartParams;

/** A named set of token values for each scheme, made by `defineTheme`. */
interface ParallaxTheme {
  readonly name: string;
  /** The values the theme sets in the light scheme, by property after `--px-`, as CSS values. */
  readonly light: Readonly<Record<string, string>>;
  /** The values the theme sets in the dark scheme. */
  readonly dark: Readonly<Record<string, string>>;
}

/** What `defineTheme` makes a theme from. */
interface ThemeSpec {
  /** Names the theme in the page's styles: lowercase letters, digits and hyphens, starting with a letter. */
  readonly name: string;
  /** A theme whose values this one starts from. */
  readonly extends?: ParallaxTheme;
  /** Values for both schemes. */
  readonly params?: ThemeParams;
  /** Values for the light scheme only, over `params`. */
  readonly light?: ThemeParams;
  /** Values for the dark scheme only, over `params`. */
  readonly dark?: ThemeParams;
}

const themeName = /^[a-z][a-z0-9-]*$/u;

/** Every token's name, in the stylesheet's order. */
const tokenNames: readonly TokenName[] = keys(specs);

/** A theme's chart colours as CSS values by property, one property per colour of each list. */
function declaredCharts(params: ThemeParams): readonly (readonly [string, string])[] {
  const lists = chartLists.flatMap(([property, key]) =>
    (params[key] ?? []).map((color, index) => [`${property}-${String(index + 1)}`, color] as const),
  );
  const singles = chartSingles.flatMap((key) => {
    const color = params[key];
    return color === undefined ? [] : [[key, color] as const];
  });
  return [...lists, ...singles];
}

/** A theme's parameters as CSS values by property: numbers become pixels. */
function declared(params: ThemeParams | undefined): Readonly<Record<string, string>> {
  if (params === undefined) {
    return {};
  }
  const tokens = tokenNames.flatMap((name) => {
    const value = params[name];
    if (value === undefined) {
      return [];
    }
    return [
      [specs[name].property, typeof value === "number" ? `${String(value)}px` : value] as const,
    ];
  });
  return Object.fromEntries([...tokens, ...declaredCharts(params)]);
}

/**
 * Makes a theme: values for some tokens, in both schemes or in one, over those of the theme it extends. Give it to
 * `<ParallaxProvider theme>`. A token a host sets in CSS still wins. A name is one theme on a page: a theme given the
 * name of one installed before replaces it there, as a theme edited while the page runs does.
 *
 * Throws if `name` is not lowercase letters, digits and hyphens.
 */
function defineTheme(spec: ThemeSpec): ParallaxTheme {
  if (!themeName.test(spec.name)) {
    throw new Error(
      `A theme's name must be lowercase letters, digits and hyphens, starting with a letter: "${spec.name}".`,
    );
  }
  const both = declared(spec.params);
  return {
    dark: { ...spec.extends?.dark, ...both, ...declared(spec.dark) },
    light: { ...spec.extends?.light, ...both, ...declared(spec.light) },
    name: spec.name,
  };
}

/** Another token's value, for a theme's value made from it, such as
 * `color-mix(in srgb, ${token("foreground")} 8%, ${token("background")})`. */
function token(name: TokenName): string {
  return `var(--_px-${specs[name].property})`;
}

export { defineTheme, token, tokenNames };
export type { ParallaxTheme, ThemeParams, ThemeSpec };
