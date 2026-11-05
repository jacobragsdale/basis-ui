import { afterEach, describe, expect, it, vi } from "vitest";

import { CHART_COLORS, THEME_STYLES, TOKEN_PROPERTIES, defaultTheme, defineTheme, readChartColors, readTheme, standardTheme, themeStyles } from "./theme";

describe("the token stylesheet", () => {
  it("declares every token on each component, as the host's value, else the theme's, else the default", () => {
    for (const property of TOKEN_PROPERTIES) {
      const name = property.slice("--px-".length);
      expect(THEME_STYLES).toMatch(new RegExp(`--_px-${name}: (calc\\()?var\\(--px-${name}, var\\(--_px-theme-${name}, `));
    }
    expect(THEME_STYLES).toContain("@layer parallax { :is(px-grid, px-pivot, px-chart) {");
  });

  it("registers colours and lengths, so their computed values are concrete, and leaves font families and shadows as text", () => {
    expect(THEME_STYLES).toContain('@property --_px-accent { syntax: "<color>"; inherits: true; initial-value: #0b4ea2; }');
    expect(THEME_STYLES).toContain('@property --_px-font-size { syntax: "<length>"; inherits: true; initial-value: 13px; }');
    expect(THEME_STYLES).toContain('@property --_px-series-1 { syntax: "<color>"; inherits: true; initial-value: #2a78d6; }');
    expect(THEME_STYLES).not.toContain("@property --_px-font-family");
    expect(THEME_STYLES).not.toContain("@property --_px-shadow");
  });

  it("adds the density's step to the row and header heights, whoever sets them, and derives sizes from other tokens", () => {
    expect(THEME_STYLES).toContain('[data-px-density="comfortable"] { --_px-density-step: 6px; }');
    expect(THEME_STYLES).toContain("--_px-row-height: calc(var(--px-row-height, var(--_px-theme-row-height, 24px)) + var(--_px-density-step, 0px));");
    expect(THEME_STYLES).toContain(
      "--_px-header-height: calc(var(--px-header-height, var(--_px-theme-header-height, var(--px-row-height, var(--_px-theme-row-height, 24px)))) + var(--_px-density-step, 0px));"
    );
    expect(THEME_STYLES).toContain("--_px-cell-padding: var(--px-cell-padding, var(--_px-theme-cell-padding, calc(var(--_px-spacing) * 1.5)));");
    expect(THEME_STYLES).toContain('@property --_px-cell-padding { syntax: "<length>"; inherits: true; initial-value: 6px; }');
  });

  it("declares the dark defaults only where they differ from the light ones", () => {
    const dark = THEME_STYLES.slice(THEME_STYLES.indexOf('[data-px-scheme="dark"]'));
    expect(dark).toContain("--_px-background: var(--px-background, var(--_px-theme-background, #16181d));");
    expect(dark).toContain("--_px-series-1: var(--px-series-1, var(--_px-theme-series-1, #3987e5));");
    expect(dark).not.toContain("--_px-font-size:");
  });
});

describe("defineTheme", () => {
  it("writes numbers as pixels, and each chart colour as its own property", () => {
    const theme = defineTheme({ name: "spec-pixels", params: { radius: 8, fontSize: "14px", accent: "#7c3aed", series: ["#111111", "#222222"], up: "#00aa00" } });
    expect(theme.light).toEqual(theme.dark);
    expect(theme.light).toMatchObject({ radius: "8px", "font-size": "14px", accent: "#7c3aed", "series-1": "#111111", "series-2": "#222222", up: "#00aa00" });
  });

  it("puts a scheme's own values over those for both, and over those of the theme it extends", () => {
    const base = defineTheme({ name: "spec-base", params: { accent: "#000001", radius: 2 }, dark: { background: "#000002" } });
    const theme = defineTheme({ name: "spec-child", extends: base, params: { accent: "#000003" }, dark: { accent: "#000004" } });
    expect(theme.light).toEqual({ accent: "#000003", radius: "2px" });
    expect(theme.dark).toEqual({ accent: "#000004", radius: "2px", background: "#000002" });
  });

  it("refuses a name CSS can't hold, and a second, different theme of the same name", () => {
    expect(() => defineTheme({ name: "Has Space" })).toThrow(/lowercase letters/);
    defineTheme({ name: "spec-twice", params: { accent: "#123456" } });
    expect(() => defineTheme({ name: "spec-twice", params: { accent: "#123456" } })).not.toThrow();
    expect(() => defineTheme({ name: "spec-twice", params: { accent: "#654321" } })).toThrow(/already named/);
  });

  it("declares a theme's values for components given it, in each scheme apart", () => {
    const theme = defineTheme({ name: "spec-styles", light: { accent: "#0000aa" }, dark: { accent: "#aaaaff" } });
    const css = themeStyles(theme);
    expect(css).toContain(':is(px-grid, px-pivot, px-chart)[data-px-theme="spec-styles"][data-px-scheme="light"] { --_px-theme-accent: #0000aa; }');
    expect(css).toContain(':is(px-grid, px-pivot, px-chart)[data-px-theme="spec-styles"][data-px-scheme="dark"] { --_px-theme-accent: #aaaaff; }');
    expect(themeStyles(standardTheme)).toBe("");
  });
});

describe("reading the tokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  /** A component in `scheme` with an element inside it, as the canvas is. */
  function inside(scheme: "light" | "dark"): HTMLElement {
    const host = document.createElement("px-grid");
    host.setAttribute("data-px-scheme", scheme);
    const canvas = document.createElement("canvas");
    host.append(canvas);
    document.body.append(host);
    return canvas;
  }

  it("returns the values in effect, and the scheme's defaults for any not set", () => {
    const canvas = inside("dark");
    canvas.style.setProperty("--_px-accent", "rgb(1, 2, 3)");
    canvas.style.setProperty("--_px-series-2", "rgb(4, 5, 6)");
    const theme = readTheme(canvas);
    expect(theme.accent).toBe("rgb(1, 2, 3)");
    expect(theme.background).toBe(defaultTheme("dark").background);
    expect(theme.font).toBe(`13px ${defaultTheme("dark").fontFamily}`);
    const colors = readChartColors(canvas);
    expect(colors.series[1]).toBe("rgb(4, 5, 6)");
    expect(colors.series[0]).toBe(CHART_COLORS.dark.series[0]);
  });

  it("warns once about a value CSS refuses", () => {
    vi.stubGlobal("CSS", { supports: (property: string, value: string) => !(property === "color" && value === "purpel") });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const canvas = inside("light");
    canvas.style.setProperty("--px-accent", "purpel");
    readTheme(canvas);
    readTheme(canvas);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("--px-accent: purpel");
  });
});
