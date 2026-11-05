/**
 * Design tokens. Every colour, font and size the components draw with is a token, and each token has three CSS custom
 * properties:
 *
 * - `--px-accent` is public. The library never declares it, so a value a host sets anywhere, on `:root`, on a wrapper
 *   or on the element, wins over any theme.
 * - `--_px-theme-accent` is a theme's value, which `defineTheme` declares for the components given that theme.
 * - `--_px-accent` is the value in effect. Each component declares it as the public value, else the theme's, else the
 *   default for its scheme. It is registered with `@property`, so `getComputedStyle` returns a concrete colour or
 *   length, which the canvas draws with, even when the value is a `color-mix()`, a `calc()` or a `light-dark()`.
 *
 * Every declaration is in the `parallax` cascade layer, below any rule a host writes.
 */

/** The light or dark set of defaults; `auto` follows the system's preference. */
export type Scheme = "light" | "dark" | "auto";

/** A scheme as drawn. */
export type ResolvedScheme = Exclude<Scheme, "auto">;

/** How a token's value is checked and registered. */
type Syntax = "color" | "length" | "family" | "weight" | "shadow";

/** The `@property` syntax each kind registers with, if any, and the CSS property a host's value is checked against. */
const SYNTAXES: Readonly<Record<Syntax, { readonly register: string | null; readonly check: string }>> = {
  color: { register: "<color>", check: "color" },
  length: { register: "<length>", check: "width" },
  family: { register: null, check: "font-family" },
  weight: { register: null, check: "font-weight" },
  shadow: { register: null, check: "box-shadow" }
};

/**
 * One token: its property after `--px-`, its kind, and its default in each scheme. A default may be an expression of
 * other tokens, such as a `calc()`; `initial` is then the value it registers with, which must be a plain value.
 * `stepped` lengths grow by the density's step, so a comfortable grid's rows are taller in any theme.
 */
interface TokenSpec {
  readonly property: string;
  readonly syntax: Syntax;
  readonly light: string;
  readonly dark: string;
  readonly initial?: string;
  readonly stepped?: boolean;
}

const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** The value a host or a theme gives the token `property`, else `otherwise`: what a default derived from it reads. */
function given(property: string, otherwise: string): string {
  return `var(--px-${property}, var(--_px-theme-${property}, ${otherwise}))`;
}

/** How many of the spacing unit, as a length. */
function spaced(units: number): string {
  return `calc(var(--_px-spacing) * ${String(units)})`;
}

/** Every token but the charts' colours, by its name in a theme's parameters. */
const SPECS = {
  fontFamily: { property: "font-family", syntax: "family", light: FONT_FAMILY, dark: FONT_FAMILY },
  fontSize: { property: "font-size", syntax: "length", light: "13px", dark: "13px" },
  background: { property: "background", syntax: "color", light: "#ffffff", dark: "#16181d" },
  stripe: { property: "stripe", syntax: "color", light: "#f6f7f9", dark: "#1c1f26" },
  foreground: { property: "foreground", syntax: "color", light: "#1d2330", dark: "#e3e6ec" },
  muted: { property: "muted", syntax: "color", light: "#667085", dark: "#8a93a3" },
  negative: { property: "negative", syntax: "color", light: "#b42318", dark: "#ff7b72" },
  totalForeground: { property: "total-foreground", syntax: "color", light: "#0b4ea2", dark: "#7cb7ff" },
  headerBackground: { property: "header-background", syntax: "color", light: "#e8ebf0", dark: "#23262e" },
  headerForeground: { property: "header-foreground", syntax: "color", light: "#1d2330", dark: "#e3e6ec" },
  borderColor: { property: "border-color", syntax: "color", light: "#e3e6eb", dark: "#2b2f38" },
  selectionBackground: { property: "selection-background", syntax: "color", light: "rgba(11, 78, 162, 0.14)", dark: "rgba(91, 155, 255, 0.25)" },
  selectionBorder: { property: "selection-border", syntax: "color", light: "#0b4ea2", dark: "#5b9bff" },
  statusBackground: { property: "status-background", syntax: "color", light: "#f2f4f7", dark: "#1c1f26" },
  statusForeground: { property: "status-foreground", syntax: "color", light: "#344054", dark: "#b8bfcc" },
  warning: { property: "warning", syntax: "color", light: "#b54708", dark: "#e0a400" },
  danger: { property: "danger", syntax: "color", light: "#b42318", dark: "#ff7b72" },
  /** The background behind text that matches a search. */
  highlight: { property: "highlight", syntax: "color", light: "#ffe58a", dark: "rgba(255, 214, 10, 0.38)" },
  /** Buttons, the toolbar's active parts and the drop target of a drag. */
  accent: { property: "accent", syntax: "color", light: "#0b4ea2", dark: "#5b9bff" },
  controlBackground: { property: "control-background", syntax: "color", light: "#ffffff", dark: "#1c1f26" },
  controlForeground: { property: "control-foreground", syntax: "color", light: "#1d2330", dark: "#e3e6ec" },
  controlBorder: { property: "control-border", syntax: "color", light: "#c9ced8", dark: "#3a3f4b" },
  controlHover: { property: "control-hover", syntax: "color", light: "#eef1f6", dark: "#262a33" },
  /** The ring around a focused control. */
  focus: { property: "focus", syntax: "color", light: "rgba(11, 78, 162, 0.45)", dark: "rgba(91, 155, 255, 0.55)" },
  /** Under popovers and menus. */
  shadow: { property: "shadow", syntax: "shadow", light: "0 6px 18px rgba(16, 24, 40, 0.16)", dark: "0 6px 18px rgba(0, 0, 0, 0.5)" },
  radius: { property: "radius", syntax: "length", light: "6px", dark: "6px" },
  /** Behind a filter chip. */
  chipBackground: { property: "chip-background", syntax: "color", light: "#e8eefb", dark: "#22324d" },
  /** The unit every gap, margin and padding is a multiple of. */
  spacing: { property: "spacing", syntax: "length", light: "4px", dark: "4px" },
  /** A grid row, before the density's step. */
  rowHeight: { property: "row-height", syntax: "length", light: "24px", dark: "24px", stepped: true },
  /** The grid's header, before the density's step. */
  headerHeight: { property: "header-height", syntax: "length", light: given("row-height", "24px"), dark: given("row-height", "24px"), initial: "24px", stepped: true },
  /** Between a cell's edge and its text. */
  cellPadding: { property: "cell-padding", syntax: "length", light: spaced(1.5), dark: spaced(1.5), initial: "6px" },
  /** How far each level of a group column's tree is indented. */
  indent: { property: "indent", syntax: "length", light: "14px", dark: "14px" },
  /** Icons in toolbars and menus; the grid's header draws them at seven eighths of this. */
  iconSize: { property: "icon-size", syntax: "length", light: "16px", dark: "16px" },
  /** Buttons, inputs and selects. */
  controlHeight: { property: "control-height", syntax: "length", light: "28px", dark: "28px" },
  /** Status bars, chips, legends and notes. */
  fontSizeSmall: { property: "font-size-small", syntax: "length", light: "calc(var(--_px-font-size) - 1px)", dark: "calc(var(--_px-font-size) - 1px)", initial: "12px" },
  headerFontWeight: { property: "header-font-weight", syntax: "weight", light: "400", dark: "400" },
  /** The totals row's. */
  totalFontWeight: { property: "total-font-weight", syntax: "weight", light: "600", dark: "600" },
  /** Between the grid's columns. */
  columnBorder: { property: "column-border", syntax: "color", light: "var(--_px-border-color)", dark: "var(--_px-border-color)", initial: "#e3e6eb" },
  /** Between the grid's rows; transparent draws none. */
  rowBorder: { property: "row-border", syntax: "color", light: "transparent", dark: "transparent" },
  /** Under the grid's header. */
  headerBorder: { property: "header-border", syntax: "color", light: "var(--_px-border-color)", dark: "var(--_px-border-color)", initial: "#e3e6eb" },
  /** Over the grid's totals row. */
  totalBorder: { property: "total-border", syntax: "color", light: "var(--_px-border-color)", dark: "var(--_px-border-color)", initial: "#e3e6eb" }
} as const satisfies Readonly<Record<string, TokenSpec>>;

/** The name of a token in a theme's parameters, such as `accent` or `fontSize`. */
export type TokenName = keyof typeof SPECS;

/** The tokens whose values are lengths, which a theme may give as a number of pixels. */
type LengthToken = { readonly [K in TokenName]: (typeof SPECS)[K]["syntax"] extends "length" ? K : never }[TokenName];

/** The tokens in effect for one component, as the canvas draws with them, with `font` made of the size and the family. */
export type Theme = Readonly<Record<TokenName, string>> & { readonly font: string };

/** The colours charts draw data with, beside the tokens they share with the grid. */
export interface ChartColors {
  /** Categorical slots, assigned to series in this order and never cycled. */
  readonly series: readonly string[];
  /** Candles that close above their open, drawn hollow. */
  readonly up: string;
  /** Candles that close below their open, drawn filled. */
  readonly down: string;
  /** A sequential ramp from near zero to the most, for densities and heatmaps. */
  readonly ramp: readonly string[];
  /** The neutral midpoint and the negative pole when values take both signs. */
  readonly middle: string;
  readonly negativeRamp: readonly string[];
}

/** Chart colours by scheme: a categorical order checked for colour-vision deficiency on each scheme's surface. */
export const CHART_COLORS: Readonly<Record<ResolvedScheme, ChartColors>> = {
  light: {
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
    up: "#1baf7a",
    down: "#e34948",
    ramp: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
    middle: "#f0efec",
    negativeRamp: ["#fbd5d4", "#f4a9a8", "#ec7c7b", "#e34948", "#c12f2f", "#9a2222", "#701818"]
  },
  dark: {
    series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
    up: "#199e70",
    down: "#e66767",
    ramp: ["#0d366b", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"],
    middle: "#383835",
    negativeRamp: ["#5c1414", "#7d1d1d", "#a12828", "#c93838", "#e66767", "#f09a99", "#f8cbca"]
  }
};

/** The charts' colours a theme may set, by their names in `ChartColors`. */
type ChartParams = { readonly [K in keyof ChartColors]?: ChartColors[K] };

/** A theme's values for some tokens: colours as CSS colours, lengths as CSS lengths or numbers of pixels. */
export type ThemeParams = { readonly [K in TokenName]?: K extends LengthToken ? string | number : string } & ChartParams;

/** What `defineTheme` makes a theme from. */
export interface ThemeSpec {
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

/** A named set of token values for each scheme, made by `defineTheme` and given to a component's `theme` input. */
export interface ParallaxTheme {
  readonly name: string;
  /** The values the theme sets in the light scheme, by property after `--px-`, as CSS values. */
  readonly light: Readonly<Record<string, string>>;
  /** The values the theme sets in the dark scheme. */
  readonly dark: Readonly<Record<string, string>>;
}

/** A token or chart colour as the stylesheet declares it. */
type Entry = TokenSpec;

const TOKEN_NAMES = Object.keys(SPECS).filter((key): key is TokenName => key in SPECS);

/** Every chart colour's property and defaults: `series-1` to `series-8`, `up`, `ramp-1` to `ramp-7`, and so on. */
function chartEntries(): readonly Entry[] {
  const { light, dark } = CHART_COLORS;
  const list = (name: string, ofLight: readonly string[], ofDark: readonly string[]): Entry[] =>
    ofLight.map((value, i) => ({ property: `${name}-${String(i + 1)}`, syntax: "color", light: value, dark: ofDark[i] ?? value }));
  const one = (property: string, ofLight: string, ofDark: string): Entry => ({ property, syntax: "color", light: ofLight, dark: ofDark });
  return [
    ...list("series", light.series, dark.series),
    one("up", light.up, dark.up),
    one("down", light.down, dark.down),
    ...list("ramp", light.ramp, dark.ramp),
    one("middle", light.middle, dark.middle),
    ...list("negative-ramp", light.negativeRamp, dark.negativeRamp)
  ];
}

/** Every custom property the stylesheet declares. */
const ENTRIES: readonly Entry[] = [...TOKEN_NAMES.map((name) => SPECS[name]), ...chartEntries()];

/** How much taller a comfortable grid's rows and header are than a compact one's, in pixels. */
export const DENSITY_STEP = 6;

/** The components the tokens are declared on. */
const HOSTS = ":is(px-grid, px-pivot, px-chart)";

function resolved(entry: Entry, value: string): string {
  const own = given(entry.property, value);
  return `--_px-${entry.property}: ${entry.stepped === true ? `calc(${own} + var(--_px-density-step, 0px))` : own};`;
}

/**
 * The stylesheet that registers and declares every token: `@property` rules for the colours and lengths, then the
 * light defaults on every component and the dark ones on components in the dark scheme.
 */
function baseStyles(): string {
  const registered = ENTRIES.flatMap((entry) => {
    const syntax = SYNTAXES[entry.syntax].register;
    return syntax === null ? [] : [`@property --_px-${entry.property} { syntax: "${syntax}"; inherits: true; initial-value: ${entry.initial ?? entry.light}; }`];
  });
  const light = ENTRIES.map((entry) => resolved(entry, entry.light));
  const dark = ENTRIES.filter((entry) => entry.dark !== entry.light).map((entry) => resolved(entry, entry.dark));
  const comfortable = `${HOSTS}[data-px-density="comfortable"] { --_px-density-step: ${String(DENSITY_STEP)}px; }`;
  return [...registered, `@layer parallax { ${HOSTS} { ${light.join(" ")} } ${HOSTS}[data-px-scheme="dark"] { ${dark.join(" ")} } ${comfortable} }`].join("\n");
}

/** The stylesheet that registers and declares every token. */
export const THEME_STYLES = baseStyles();

const STYLE_ID = "px-theme-tokens";

/** Adds the token stylesheet to a document once. Angular needs component styles to be static, so the generated sheet is added here. */
export function installThemeStyles(document: Document): void {
  if (document.getElementById(STYLE_ID) !== null) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = THEME_STYLES;
  document.head.append(style);
}

/** A theme's parameters as CSS values by property: numbers become pixels, and each chart list one property per colour. */
function declared(params: ThemeParams | undefined): Readonly<Record<string, string>> {
  if (params === undefined) {
    return {};
  }
  const values: Record<string, string> = {};
  for (const name of TOKEN_NAMES) {
    const value = params[name];
    if (value !== undefined) {
      values[SPECS[name].property] = typeof value === "number" ? `${String(value)}px` : value;
    }
  }
  const list = (name: string, colors: readonly string[] | undefined): void => {
    colors?.forEach((color, i) => {
      values[`${name}-${String(i + 1)}`] = color;
    });
  };
  list("series", params.series);
  list("ramp", params.ramp);
  list("negative-ramp", params.negativeRamp);
  for (const [property, color] of [
    ["up", params.up],
    ["down", params.down],
    ["middle", params.middle]
  ] as const) {
    if (color !== undefined) {
      values[property] = color;
    }
  }
  return values;
}

const THEME_NAME = /^[a-z][a-z0-9-]*$/;

/** The themes defined so far, by name, to refuse a second, different theme of the same name. */
const defined = new Map<string, string>();

/**
 * Makes a theme: values for some tokens, in both schemes or in one, over those of the theme it extends. Give it to a
 * component's `theme` input, or to `provideParallax` for every component. A token a host sets in CSS still wins.
 *
 * Throws if `name` is not lowercase letters, digits and hyphens, or names a different theme already defined.
 */
export function defineTheme(spec: ThemeSpec): ParallaxTheme {
  if (!THEME_NAME.test(spec.name)) {
    throw new Error(`A theme's name must be lowercase letters, digits and hyphens, starting with a letter: "${spec.name}"`);
  }
  const both = declared(spec.params);
  const theme: ParallaxTheme = { name: spec.name, light: { ...spec.extends?.light, ...both, ...declared(spec.light) }, dark: { ...spec.extends?.dark, ...both, ...declared(spec.dark) } };
  const key = JSON.stringify([theme.light, theme.dark]);
  const earlier = defined.get(spec.name);
  if (earlier !== undefined && earlier !== key) {
    throw new Error(`Another theme is already named "${spec.name}"`);
  }
  defined.set(spec.name, key);
  return theme;
}

/** The library's own look: its defaults, unchanged. */
export const standardTheme: ParallaxTheme = defineTheme({ name: "standard" });

/** The stylesheet that declares a theme's values on the components given it, in each scheme. */
export function themeStyles(theme: ParallaxTheme): string {
  const rule = (scheme: ResolvedScheme, values: Readonly<Record<string, string>>): string => {
    const declarations = Object.entries(values).map(([property, value]) => `--_px-theme-${property}: ${value};`);
    return declarations.length === 0 ? "" : `${HOSTS}[data-px-theme="${theme.name}"][data-px-scheme="${scheme}"] { ${declarations.join(" ")} }`;
  };
  const rules = [rule("light", theme.light), rule("dark", theme.dark)].filter((r) => r !== "");
  return rules.length === 0 ? "" : `@layer parallax { ${rules.join(" ")} }`;
}

/** Adds a theme's stylesheet to a document once. */
export function installTheme(document: Document, theme: ParallaxTheme): void {
  const id = `px-theme-${theme.name}`;
  if (document.getElementById(id) !== null) {
    return;
  }
  const style = document.createElement("style");
  style.id = id;
  style.textContent = themeStyles(theme);
  document.head.append(style);
}

/**
 * A token's default as a plain value, for drawing before the stylesheet applies: a default derived from other tokens
 * gives the value it registers with, which is the light scheme's.
 */
function plain(entry: Entry, scheme: ResolvedScheme): string {
  return entry.initial ?? entry[scheme];
}

/** The defaults of a scheme as plain values, as `readTheme` returns them before the stylesheet applies. */
export function defaultTheme(scheme: ResolvedScheme): Theme {
  return withFont(Object.fromEntries(TOKEN_NAMES.map((name) => [name, plain(SPECS[name], scheme)])));
}

function withFont(values: Readonly<Record<string, string>>): Theme {
  const value = (name: TokenName): string => values[name] ?? SPECS[name].light;
  const tokens: Record<TokenName, string> = {
    fontFamily: value("fontFamily"),
    fontSize: value("fontSize"),
    background: value("background"),
    stripe: value("stripe"),
    foreground: value("foreground"),
    muted: value("muted"),
    negative: value("negative"),
    totalForeground: value("totalForeground"),
    headerBackground: value("headerBackground"),
    headerForeground: value("headerForeground"),
    borderColor: value("borderColor"),
    selectionBackground: value("selectionBackground"),
    selectionBorder: value("selectionBorder"),
    statusBackground: value("statusBackground"),
    statusForeground: value("statusForeground"),
    warning: value("warning"),
    danger: value("danger"),
    highlight: value("highlight"),
    accent: value("accent"),
    controlBackground: value("controlBackground"),
    controlForeground: value("controlForeground"),
    controlBorder: value("controlBorder"),
    controlHover: value("controlHover"),
    focus: value("focus"),
    shadow: value("shadow"),
    radius: value("radius"),
    chipBackground: value("chipBackground"),
    spacing: value("spacing"),
    rowHeight: value("rowHeight"),
    headerHeight: value("headerHeight"),
    cellPadding: value("cellPadding"),
    indent: value("indent"),
    iconSize: value("iconSize"),
    controlHeight: value("controlHeight"),
    fontSizeSmall: value("fontSizeSmall"),
    headerFontWeight: value("headerFontWeight"),
    totalFontWeight: value("totalFontWeight"),
    columnBorder: value("columnBorder"),
    rowBorder: value("rowBorder"),
    headerBorder: value("headerBorder"),
    totalBorder: value("totalBorder")
  };
  return { ...tokens, font: `${tokens.fontSize} ${tokens.fontFamily}` };
}

/** The values a host set that CSS refuses, already warned about, so each is reported once. */
const warned = new Set<string>();

/** Warns, once, about a public token whose value CSS refuses, which the component draws without. */
function check(style: CSSStyleDeclaration, entry: Entry): void {
  const value = style.getPropertyValue(`--px-${entry.property}`).trim();
  if (value === "" || typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports(SYNTAXES[entry.syntax].check, value)) {
    return;
  }
  const key = `${entry.property}: ${value}`;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`parallax: --px-${key} is not a valid value, so the theme's or the default is used`);
  }
}

/** The scheme `element` is drawn in, from the nearest component's `data-px-scheme`. */
function schemeOf(element: Element): ResolvedScheme {
  return element.closest("[data-px-scheme]")?.getAttribute("data-px-scheme") === "dark" ? "dark" : "light";
}

/** Reads the tokens in effect for `element`, warning about any value a host set that CSS refuses. */
export function readTheme(element: Element): Theme {
  const style = getComputedStyle(element);
  const scheme = schemeOf(element);
  const values: Record<string, string> = {};
  for (const name of TOKEN_NAMES) {
    const entry = SPECS[name];
    check(style, entry);
    const value = style.getPropertyValue(`--_px-${entry.property}`).trim();
    values[name] = value === "" ? plain(entry, scheme) : value;
  }
  return withFont(values);
}

/** Reads the chart colours in effect for `element`, falling back to its scheme's defaults. */
export function readChartColors(element: Element): ChartColors {
  const style = getComputedStyle(element);
  const fallback = CHART_COLORS[schemeOf(element)];
  const read = (property: string, otherwise: string): string => {
    const value = style.getPropertyValue(`--_px-${property}`).trim();
    return value === "" ? otherwise : value;
  };
  const list = (name: string, values: readonly string[]): readonly string[] => values.map((v, i) => read(`${name}-${String(i + 1)}`, v));
  return {
    series: list("series", fallback.series),
    up: read("up", fallback.up),
    down: read("down", fallback.down),
    ramp: list("ramp", fallback.ramp),
    middle: read("middle", fallback.middle),
    negativeRamp: list("negative-ramp", fallback.negativeRamp)
  };
}

/** Whether two sets of tokens are the same, so that a change that alters none redraws nothing. */
export function sameTheme(a: Theme, b: Theme): boolean {
  return a.font === b.font && TOKEN_NAMES.every((name) => a[name] === b[name]);
}

/** Whether two sets of chart colours are the same. */
export function sameChartColors(a: ChartColors, b: ChartColors): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Every token's public property, such as `--px-accent`, chart colours included: what a host or a theme can set. */
export const TOKEN_PROPERTIES: readonly string[] = ENTRIES.map((entry) => `--px-${entry.property}`);
