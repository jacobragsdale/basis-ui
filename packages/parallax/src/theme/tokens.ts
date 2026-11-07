/* Design tokens. Every colour, font and size the canvases draw with is a token, and each token has three CSS custom
 * properties:
 *
 * - `--px-accent` is public. The package never declares it, so a value set anywhere above a component wins over any
 *   theme.
 * - `--_px-theme-accent` is a theme's value, which `defineTheme` declares for the components given that theme.
 * - `--_px-accent` is the value in effect. Each component declares it as the public value, else the theme's, else the
 *   default for its scheme. It is registered with `@property`, so `getComputedStyle` returns a concrete colour or
 *   length, which the canvas draws with, even when the value is a `color-mix()`, a `calc()` or a `var()`. */

import { derived, given, same, tinted } from "./kinds.ts";
import type { TokenSpec } from "./kinds.ts";

const fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const rowHeight = "24px";

/** Every token but the charts' colours, by its name in a theme's parameters. The first few are the base a theme
 * usually sets; most of the rest derive from them, so a theme of an accent, a background and a foreground is
 * consistent throughout. */
const specs = {
  /** Buttons, the toolbar's active parts, selections, focus rings and the drop target of a drag. */
  accent: { dark: "#5b9bff", light: "#2563eb", property: "accent", syntax: "color" },
  background: { dark: "#16181d", light: "#ffffff", property: "background", syntax: "color" },
  foreground: { dark: "#e3e6ec", light: "#1d2330", property: "foreground", syntax: "color" },
  fontFamily: same("font-family", "family", fontFamily),
  fontSize: same("font-size", "length", "13px"),
  /** The unit every gap, margin and padding is a multiple of. */
  spacing: same("spacing", "length", "4px"),
  /** The corners of controls, chips and menus. */
  radius: same("radius", "length", "6px"),
  /** A grid row, before the density's step. */
  rowHeight: { ...same("row-height", "length", rowHeight), stepped: true },
  muted: { dark: "#8a93a3", light: "#667085", property: "muted", syntax: "color" },
  negative: { dark: "#ff7b72", light: "#b42318", property: "negative", syntax: "color" },
  warning: { dark: "#e0a400", light: "#b54708", property: "warning", syntax: "color" },
  danger: { dark: "#ff7b72", light: "#b42318", property: "danger", syntax: "color" },
  /** The background behind text that matches a search. */
  highlight: {
    dark: "rgba(255, 214, 10, 0.38)",
    light: "#ffe58a",
    property: "highlight",
    syntax: "color",
  },
  /** Text on the accent, the warning and the danger colours. */
  onAccent: { dark: "#0b1220", light: "#ffffff", property: "on-accent", syntax: "color" },
  /** Lines between parts: under the toolbar, around menus and panels. */
  borderColor: tinted(
    "border-color",
    { dark: 16, light: 12, of: "foreground", over: "background" },
    "#e1e2e5",
  ),
  /** Behind the header, the totals row, the status bar and the pivot's settings. */
  chromeBackground: tinted(
    "chrome-background",
    { dark: 5, light: 3, of: "foreground", over: "background" },
    "#f8f8f9",
  ),
  /** Behind every other row. */
  stripe: tinted("stripe", { dark: 3, light: 2, of: "foreground", over: "background" }, "#fafafb"),
  /** Behind the row under the pointer; transparent turns the highlight off. */
  rowHover: tinted(
    "row-hover",
    { dark: 10, light: 6, of: "accent", over: "background" },
    "#f1f5fe",
  ),
  headerBackground: derived("header-background", "color", {
    initial: "#f8f8f9",
    value: "var(--_px-chrome-background)",
  }),
  headerForeground: tinted(
    "header-foreground",
    { dark: 85, light: 85, of: "foreground", over: "background" },
    "#3c414e",
  ),
  headerFontWeight: same("header-font-weight", "weight", "600"),
  /** The grand total's label in a pivot. */
  totalForeground: derived("total-foreground", "color", {
    initial: "#2563eb",
    value: "var(--_px-accent)",
  }),
  totalBackground: derived("total-background", "color", {
    initial: "#f8f8f9",
    value: "var(--_px-chrome-background)",
  }),
  /** The totals row's. */
  totalFontWeight: same("total-font-weight", "weight", "600"),
  /** A group's row, in a pivot or a grouped grid. */
  groupFontWeight: same("group-font-weight", "weight", "600"),
  /** Behind a group's row in a grouped grid; a pivot's groups keep the stripes. */
  groupBackground: derived("group-background", "color", {
    initial: "#f8f8f9",
    value: "var(--_px-chrome-background)",
  }),
  selectionBackground: tinted(
    "selection-background",
    { dark: 22, light: 12, of: "accent", over: "transparent" },
    "rgba(37, 99, 235, 0.12)",
  ),
  selectionBorder: derived("selection-border", "color", {
    initial: "#2563eb",
    value: "var(--_px-accent)",
  }),
  statusBackground: derived("status-background", "color", {
    initial: "#f8f8f9",
    value: "var(--_px-chrome-background)",
  }),
  statusForeground: tinted(
    "status-foreground",
    { dark: 72, light: 72, of: "foreground", over: "background" },
    "#61656e",
  ),
  controlBackground: derived("control-background", "color", {
    initial: "#ffffff",
    value: "var(--_px-background)",
  }),
  controlForeground: derived("control-foreground", "color", {
    initial: "#1d2330",
    value: "var(--_px-foreground)",
  }),
  controlBorder: tinted(
    "control-border",
    { dark: 22, light: 18, of: "foreground", over: "background" },
    "#d2d3d6",
  ),
  controlHover: tinted(
    "control-hover",
    { dark: 9, light: 6, of: "foreground", over: "background" },
    "#f0f0f1",
  ),
  /** The ring around a focused control. */
  focus: tinted(
    "focus",
    { dark: 45, light: 35, of: "accent", over: "transparent" },
    "rgba(37, 99, 235, 0.35)",
  ),
  /** Behind a filter chip and a drop target. */
  chipBackground: tinted(
    "chip-background",
    { dark: 20, light: 10, of: "accent", over: "background" },
    "#e9effd",
  ),
  /** Under popovers, menus and tooltips. */
  shadow: {
    dark: "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.5)",
    light: "0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px rgba(16, 24, 40, 0.14)",
    property: "shadow",
    syntax: "shadow",
  },
  /** Around a grid or pivot; none removes it. */
  wrapperBorder: derived("wrapper-border", "border", {
    initial: "1px solid #e1e2e5",
    value: "1px solid var(--_px-border-color)",
  }),
  /** The corners of a grid or pivot, and of menus and popovers. */
  wrapperRadius: same("wrapper-radius", "length", "8px"),
  /** The scrollbars' thumbs. */
  scrollbar: tinted(
    "scrollbar",
    { dark: 30, light: 25, of: "foreground", over: "background" },
    "#c6c8cb",
  ),
  /** The grid's header, before the density's step. */
  headerHeight: {
    ...derived("header-height", "length", {
      initial: "30px",
      value: `calc(${given("row-height", rowHeight)} + 6px)`,
    }),
    stepped: true,
  },
  /** Between a cell's edge and its text. */
  cellPadding: derived("cell-padding", "length", {
    initial: "8px",
    value: "calc(var(--_px-spacing) * 2)",
  }),
  /** How far each level of a group column's tree is indented. */
  indent: same("indent", "length", "14px"),
  /** Icons in toolbars and menus; the grid's header draws them at seven eighths of this. */
  iconSize: same("icon-size", "length", "16px"),
  /** Buttons, inputs and selects. */
  controlHeight: same("control-height", "length", "28px"),
  /** Status bars, chips, legends and notes. */
  fontSizeSmall: derived("font-size-small", "length", {
    initial: "12px",
    value: "calc(var(--_px-font-size) - 1px)",
  }),
  /** Between the grid's columns; transparent draws none. */
  columnBorder: tinted(
    "column-border",
    { dark: 9, light: 7, of: "foreground", over: "background" },
    "#eeeeef",
  ),
  /** Between the grid's rows; transparent draws none. */
  rowBorder: same("row-border", "color", "transparent"),
  /** Under the grid's header. */
  headerBorder: derived("header-border", "color", {
    initial: "#e1e2e5",
    value: "var(--_px-border-color)",
  }),
  /** Over the grid's totals row. */
  totalBorder: tinted(
    "total-border",
    { dark: 26, light: 22, of: "foreground", over: "background" },
    "#cbccd0",
  ),
  /** A chart's gridlines, fainter than its axis. */
  gridline: tinted(
    "gridline",
    { dark: 11, light: 8, of: "foreground", over: "background" },
    "#ebebec",
  ),
  /** The shadow at the edge of pinned columns once the rest scroll under them. */
  pinnedShadow: tinted(
    "pinned-shadow",
    { dark: 40, light: 14, of: "foreground", over: "transparent" },
    "rgba(29, 35, 48, 0.14)",
  ),
} as const satisfies Readonly<Record<string, TokenSpec>>;

/** The name of a token in a theme's parameters, such as `accent` or `fontSize`. */
type TokenName = keyof typeof specs;

/** The tokens whose values are lengths, which a theme may give as a number of pixels. */
type LengthToken = {
  readonly [TName in TokenName]: (typeof specs)[TName]["syntax"] extends "length" ? TName : never;
}[TokenName];

export { specs };
export type { LengthToken, TokenName };
