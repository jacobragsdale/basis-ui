/* Themes: values for some tokens, in both schemes or in one, which `defineTheme` makes and a component draws with. A
 * token set above a component in CSS still wins over its theme. */

import { keys } from "@basis/ui/utils";

import type { ChartColors } from "./charts.ts";
import { chartLists, chartSingles } from "./charts.ts";
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

/** The themes defined so far, by name, to refuse a second, different theme of the same name. */
const defined = new Map<string, string>();

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
 * `<ParallaxProvider theme>`. A token a host sets in CSS still wins.
 *
 * Throws if `name` is not lowercase letters, digits and hyphens, or names a different theme already defined.
 */
function defineTheme(spec: ThemeSpec): ParallaxTheme {
  if (!themeName.test(spec.name)) {
    throw new Error(
      `A theme's name must be lowercase letters, digits and hyphens, starting with a letter: "${spec.name}".`,
    );
  }
  const both = declared(spec.params);
  const theme: ParallaxTheme = {
    dark: { ...spec.extends?.dark, ...both, ...declared(spec.dark) },
    light: { ...spec.extends?.light, ...both, ...declared(spec.light) },
    name: spec.name,
  };
  const key = JSON.stringify([theme.light, theme.dark]);
  const earlier = defined.get(spec.name);
  if (earlier !== undefined && earlier !== key) {
    throw new Error(`Another theme is already named "${spec.name}"; give this one another name.`);
  }
  defined.set(spec.name, key);
  return theme;
}

/** Another token's value, for a theme's value made from it, such as
 * `color-mix(in srgb, ${token("foreground")} 8%, ${token("background")})`. */
function token(name: TokenName): string {
  return `var(--_px-${specs[name].property})`;
}

/** Parallax's own look, refined and dense: its defaults, unchanged. */
const standardTheme: ParallaxTheme = defineTheme({ name: "standard" });

/** A roomier look: taller rows and header, wider padding, no lines between columns and a hairline between rows in
 * place of stripes, a header on the grid's own background, and rounder corners. */
const airyTheme: ParallaxTheme = defineTheme({
  name: "airy",
  params: {
    cellPadding: 12,
    columnBorder: "transparent",
    controlHeight: 32,
    groupBackground: `color-mix(in srgb, ${token("accent")} 5%, ${token("background")})`,
    headerBackground: token("background"),
    headerHeight: 38,
    radius: 8,
    rowBorder: `color-mix(in srgb, ${token("foreground")} 8%, ${token("background")})`,
    rowHeight: 30,
    spacing: 5,
    stripe: "transparent",
    totalBackground: token("background"),
    wrapperRadius: 12,
  },
});

export { airyTheme, defineTheme, standardTheme, token, tokenNames };
export type { ParallaxTheme, ThemeParams, ThemeSpec };
