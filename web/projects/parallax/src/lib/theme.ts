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
type Syntax = "color" | "length" | "family" | "weight" | "shadow" | "border";

/** The `@property` syntax each kind registers with, if any, and the CSS property a host's value is checked against. */
const SYNTAXES: Readonly<Record<Syntax, { readonly register: string | null; readonly check: string }>> = {
  color: { register: "<color>", check: "color" },
  length: { register: "<length>", check: "width" },
  family: { register: null, check: "font-family" },
  weight: { register: null, check: "font-weight" },
  shadow: { register: null, check: "box-shadow" },
  border: { register: null, check: "border" }
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

/** `percent` of the token `of` over the token `over`, such as a tint of the foreground over the background. */
function mix(of: string, percent: number, over: string): string {
  return `color-mix(in srgb, var(--_px-${of}) ${String(percent)}%, ${over === "transparent" ? over : `var(--_px-${over})`})`;
}

/** A token whose default is derived from others the same way in both schemes, registered with `initial`. */
function derived<S extends Syntax>(property: string, syntax: S, value: string, initial: string): TokenSpec & { readonly syntax: S } {
  return { property, syntax, light: value, dark: value, initial };
}

/** A colour token tinted from others by a different amount in each scheme. */
function tinted(property: string, of: string, light: number, dark: number, over: string, initial: string): TokenSpec & { readonly syntax: "color" } {
  return { property, syntax: "color", light: mix(of, light, over), dark: mix(of, dark, over), initial };
}

/**
 * Every token but the charts' colours, by its name in a theme's parameters. The first few are the base a theme
 * usually sets; most of the rest derive from them, so a theme of an accent, a background and a foreground is
 * consistent throughout.
 */
const SPECS = {
  /** Buttons, the toolbar's active parts, selections, focus rings and the drop target of a drag. */
  accent: { property: "accent", syntax: "color", light: "#2563eb", dark: "#5b9bff" },
  background: { property: "background", syntax: "color", light: "#ffffff", dark: "#16181d" },
  foreground: { property: "foreground", syntax: "color", light: "#1d2330", dark: "#e3e6ec" },
  fontFamily: { property: "font-family", syntax: "family", light: FONT_FAMILY, dark: FONT_FAMILY },
  fontSize: { property: "font-size", syntax: "length", light: "13px", dark: "13px" },
  /** The unit every gap, margin and padding is a multiple of. */
  spacing: { property: "spacing", syntax: "length", light: "4px", dark: "4px" },
  /** The corners of controls, chips and menus. */
  radius: { property: "radius", syntax: "length", light: "6px", dark: "6px" },
  /** A grid row, before the density's step. */
  rowHeight: { property: "row-height", syntax: "length", light: "24px", dark: "24px", stepped: true },
  muted: { property: "muted", syntax: "color", light: "#667085", dark: "#8a93a3" },
  negative: { property: "negative", syntax: "color", light: "#b42318", dark: "#ff7b72" },
  warning: { property: "warning", syntax: "color", light: "#b54708", dark: "#e0a400" },
  danger: { property: "danger", syntax: "color", light: "#b42318", dark: "#ff7b72" },
  /** The background behind text that matches a search. */
  highlight: { property: "highlight", syntax: "color", light: "#ffe58a", dark: "rgba(255, 214, 10, 0.38)" },
  /** Text on the accent, the warning and the danger colours. */
  onAccent: { property: "on-accent", syntax: "color", light: "#ffffff", dark: "#0b1220" },
  /** Lines between parts: under the toolbar, around menus and panels. */
  borderColor: tinted("border-color", "foreground", 12, 16, "background", "#e1e2e5"),
  /** Behind the header, the totals row, the status bar and the pivot's settings. */
  chromeBackground: tinted("chrome-background", "foreground", 3, 5, "background", "#f8f8f9"),
  /** Behind every other row. */
  stripe: tinted("stripe", "foreground", 2, 3, "background", "#fafafb"),
  /** Behind the row under the pointer; transparent turns the highlight off. */
  rowHover: tinted("row-hover", "accent", 6, 10, "background", "#f1f5fe"),
  headerBackground: derived("header-background", "color", "var(--_px-chrome-background)", "#f8f8f9"),
  headerForeground: tinted("header-foreground", "foreground", 85, 85, "background", "#3c414e"),
  headerFontWeight: { property: "header-font-weight", syntax: "weight", light: "600", dark: "600" },
  /** The grand total's label in a pivot. */
  totalForeground: derived("total-foreground", "color", "var(--_px-accent)", "#2563eb"),
  totalBackground: derived("total-background", "color", "var(--_px-chrome-background)", "#f8f8f9"),
  /** The totals row's. */
  totalFontWeight: { property: "total-font-weight", syntax: "weight", light: "600", dark: "600" },
  /** A group's row, in a pivot or a grouped grid. */
  groupFontWeight: { property: "group-font-weight", syntax: "weight", light: "600", dark: "600" },
  /** Behind a group's row in a grouped grid; a pivot's groups keep the stripes. */
  groupBackground: derived("group-background", "color", "var(--_px-chrome-background)", "#f8f8f9"),
  selectionBackground: tinted("selection-background", "accent", 12, 22, "transparent", "rgba(37, 99, 235, 0.12)"),
  selectionBorder: derived("selection-border", "color", "var(--_px-accent)", "#2563eb"),
  statusBackground: derived("status-background", "color", "var(--_px-chrome-background)", "#f8f8f9"),
  statusForeground: tinted("status-foreground", "foreground", 72, 72, "background", "#61656e"),
  controlBackground: derived("control-background", "color", "var(--_px-background)", "#ffffff"),
  controlForeground: derived("control-foreground", "color", "var(--_px-foreground)", "#1d2330"),
  controlBorder: tinted("control-border", "foreground", 18, 22, "background", "#d2d3d6"),
  controlHover: tinted("control-hover", "foreground", 6, 9, "background", "#f0f0f1"),
  /** The ring around a focused control. */
  focus: tinted("focus", "accent", 35, 45, "transparent", "rgba(37, 99, 235, 0.35)"),
  /** Behind a filter chip and a drop target. */
  chipBackground: tinted("chip-background", "accent", 10, 20, "background", "#e9effd"),
  /** Under popovers, menus and tooltips. */
  shadow: { property: "shadow", syntax: "shadow", light: "0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px rgba(16, 24, 40, 0.14)", dark: "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.5)" },
  /** Around a grid or pivot; none removes it. */
  wrapperBorder: derived("wrapper-border", "border", "1px solid var(--_px-border-color)", "1px solid #e1e2e5"),
  /** The corners of a grid or pivot, and of menus and popovers. */
  wrapperRadius: { property: "wrapper-radius", syntax: "length", light: "8px", dark: "8px" },
  /** The scrollbars' thumbs. */
  scrollbar: tinted("scrollbar", "foreground", 25, 30, "background", "#c6c8cb"),
  /** The grid's header, before the density's step. */
  headerHeight: {
    property: "header-height",
    syntax: "length",
    light: `calc(${given("row-height", "24px")} + 6px)`,
    dark: `calc(${given("row-height", "24px")} + 6px)`,
    initial: "30px",
    stepped: true
  },
  /** Between a cell's edge and its text. */
  cellPadding: derived("cell-padding", "length", spaced(2), "8px"),
  /** How far each level of a group column's tree is indented. */
  indent: { property: "indent", syntax: "length", light: "14px", dark: "14px" },
  /** Icons in toolbars and menus; the grid's header draws them at seven eighths of this. */
  iconSize: { property: "icon-size", syntax: "length", light: "16px", dark: "16px" },
  /** Buttons, inputs and selects. */
  controlHeight: { property: "control-height", syntax: "length", light: "28px", dark: "28px" },
  /** Status bars, chips, legends and notes. */
  fontSizeSmall: derived("font-size-small", "length", "calc(var(--_px-font-size) - 1px)", "12px"),
  /** Between the grid's columns; transparent draws none. */
  columnBorder: tinted("column-border", "foreground", 7, 9, "background", "#eeeeef"),
  /** Between the grid's rows; transparent draws none. */
  rowBorder: { property: "row-border", syntax: "color", light: "transparent", dark: "transparent" },
  /** Under the grid's header. */
  headerBorder: derived("header-border", "color", "var(--_px-border-color)", "#e1e2e5"),
  /** Over the grid's totals row. */
  totalBorder: tinted("total-border", "foreground", 22, 26, "background", "#cbccd0"),
  /** A chart's gridlines, fainter than its axis. */
  gridline: tinted("gridline", "foreground", 8, 11, "background", "#ebebec"),
  /** The shadow at the edge of pinned columns once the rest scroll under them. */
  pinnedShadow: tinted("pinned-shadow", "foreground", 14, 40, "transparent", "rgba(29, 35, 48, 0.14)")
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
  // The scheme also picks the native controls' and scrollbars' colours; checkboxes and radios take the accent.
  const native = "accent-color: var(--_px-accent); scrollbar-color: var(--_px-scrollbar) transparent;";
  return [
    ...registered,
    `@layer parallax { ${HOSTS} { color-scheme: light; ${native} ${light.join(" ")} } ${HOSTS}[data-px-scheme="dark"] { color-scheme: dark; ${dark.join(" ")} } ${comfortable} }`
  ].join("\n");
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
    accent: value("accent"),
    background: value("background"),
    foreground: value("foreground"),
    fontFamily: value("fontFamily"),
    fontSize: value("fontSize"),
    spacing: value("spacing"),
    radius: value("radius"),
    rowHeight: value("rowHeight"),
    muted: value("muted"),
    negative: value("negative"),
    warning: value("warning"),
    danger: value("danger"),
    highlight: value("highlight"),
    onAccent: value("onAccent"),
    borderColor: value("borderColor"),
    chromeBackground: value("chromeBackground"),
    stripe: value("stripe"),
    rowHover: value("rowHover"),
    headerBackground: value("headerBackground"),
    headerForeground: value("headerForeground"),
    headerFontWeight: value("headerFontWeight"),
    totalForeground: value("totalForeground"),
    totalBackground: value("totalBackground"),
    totalFontWeight: value("totalFontWeight"),
    groupFontWeight: value("groupFontWeight"),
    groupBackground: value("groupBackground"),
    selectionBackground: value("selectionBackground"),
    selectionBorder: value("selectionBorder"),
    statusBackground: value("statusBackground"),
    statusForeground: value("statusForeground"),
    controlBackground: value("controlBackground"),
    controlForeground: value("controlForeground"),
    controlBorder: value("controlBorder"),
    controlHover: value("controlHover"),
    focus: value("focus"),
    chipBackground: value("chipBackground"),
    shadow: value("shadow"),
    wrapperBorder: value("wrapperBorder"),
    wrapperRadius: value("wrapperRadius"),
    scrollbar: value("scrollbar"),
    headerHeight: value("headerHeight"),
    cellPadding: value("cellPadding"),
    indent: value("indent"),
    iconSize: value("iconSize"),
    controlHeight: value("controlHeight"),
    fontSizeSmall: value("fontSizeSmall"),
    columnBorder: value("columnBorder"),
    rowBorder: value("rowBorder"),
    headerBorder: value("headerBorder"),
    totalBorder: value("totalBorder"),
    pinnedShadow: value("pinnedShadow"),
    gridline: value("gridline")
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
