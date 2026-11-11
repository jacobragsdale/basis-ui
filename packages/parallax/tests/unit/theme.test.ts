import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { basisTheme } from "#theme/basis.ts";
import { defineTheme, token } from "#theme/define.ts";

import { airyTheme, standardTheme } from "#theme/looks.ts";
import { themeStyles, tokenProperties, tokenStyles } from "#theme/styles.ts";

describe("the token stylesheet", () => {
  test("declares every token on each host, as the host's value, else the theme's, else the default", () => {
    for (const property of tokenProperties) {
      const name = property.slice("--px-".length);
      expect(tokenStyles).toMatch(
        new RegExp(`--_px-${name}: (calc\\()?var\\(--px-${name}, var\\(--_px-theme-${name}, `, "u"),
      );
    }
    expect(tokenStyles).toContain("@layer parallax { [data-px-scheme] {");
  });

  test("registers colours and lengths, so their computed values are concrete, and leaves families and shadows as text", () => {
    expect(tokenStyles).toContain(
      '@property --_px-accent { syntax: "<color>"; inherits: true; initial-value: #2563eb; }',
    );
    expect(tokenStyles).toContain(
      '@property --_px-font-size { syntax: "<length>"; inherits: true; initial-value: 13px; }',
    );
    expect(tokenStyles).toContain(
      '@property --_px-series-1 { syntax: "<color>"; inherits: true; initial-value: #2a78d6; }',
    );
    expect(tokenStyles).not.toContain("@property --_px-font-family");
    expect(tokenStyles).not.toContain("@property --_px-shadow");
  });

  test("sizes rows and the header by their tokens alone, which a theme may tie to the page's density", () => {
    expect(tokenStyles).not.toContain("density");
    expect(tokenStyles).toContain(
      "--_px-row-height: var(--px-row-height, var(--_px-theme-row-height, 24px));",
    );
  });

  test("derives sizes and colours from the base tokens", () => {
    expect(tokenStyles).toContain(
      "--_px-cell-padding: var(--px-cell-padding, var(--_px-theme-cell-padding, calc(var(--_px-spacing) * 2)));",
    );
    expect(tokenStyles).toContain(
      "--_px-selection-background: var(--px-selection-background, var(--_px-theme-selection-background, color-mix(in srgb, var(--_px-accent) 12%, transparent)));",
    );
    expect(tokenStyles).toContain(
      "--_px-border-color: var(--px-border-color, var(--_px-theme-border-color, color-mix(in srgb, var(--_px-foreground) 12%, var(--_px-background))));",
    );
  });

  test("declares the dark defaults only where they differ from the light ones", () => {
    const dark = tokenStyles.slice(tokenStyles.indexOf('[data-px-scheme="dark"]'));
    expect(dark).toContain("color-scheme: dark;");
    expect(dark).toContain(
      "--_px-background: var(--px-background, var(--_px-theme-background, #16181d));",
    );
    expect(dark).toContain(
      "--_px-series-1: var(--px-series-1, var(--_px-theme-series-1, #3c7dde));",
    );
    expect(dark).not.toContain("--_px-font-size:");
  });
});

describe(defineTheme, () => {
  test("writes numbers as pixels, and each chart colour as its own property", () => {
    const theme = defineTheme({
      name: "spec-pixels",
      params: {
        accent: "#7c3aed",
        fontSize: "14px",
        barRadius: 8,
        series: ["#111111", "#222222"],
        up: "#00aa00",
      },
    });
    expect(theme.light).toStrictEqual(theme.dark);
    expect(theme.light).toMatchObject({
      accent: "#7c3aed",
      "font-size": "14px",
      "bar-radius": "8px",
      "series-1": "#111111",
      "series-2": "#222222",
      up: "#00aa00",
    });
  });

  test("puts a scheme's own values over those for both, and over those of the theme it extends", () => {
    const base = defineTheme({
      dark: { background: "#000002" },
      name: "spec-base",
      params: { accent: "#000001", barRadius: 2 },
    });
    const theme = defineTheme({
      dark: { accent: "#000004" },
      extends: base,
      name: "spec-child",
      params: { accent: "#000003" },
    });
    expect(theme.light).toStrictEqual({ accent: "#000003", "bar-radius": "2px" });
    expect(theme.dark).toStrictEqual({
      accent: "#000004",
      background: "#000002",
      "bar-radius": "2px",
    });
  });

  test("refuses a name CSS cannot hold, and lets a theme be defined again under its name, as an edited one is", () => {
    expect(() => defineTheme({ name: "Has Space" })).toThrow(/lowercase letters/u);
    defineTheme({ name: "spec-twice", params: { accent: "#123456" } });
    const edited = defineTheme({ name: "spec-twice", params: { accent: "#654321" } });
    expect(edited.light).toStrictEqual({ accent: "#654321" });
  });

  test("declares a theme's values for the hosts given it, in each scheme apart", () => {
    const theme = defineTheme({
      dark: { accent: "#aaaaff" },
      light: { accent: "#0000aa" },
      name: "spec-styles",
    });
    const css = themeStyles(theme);
    expect(css).toContain(
      '[data-px-scheme][data-px-theme="spec-styles"][data-px-scheme="light"] { --_px-theme-accent: #0000aa; }',
    );
    expect(css).toContain(
      '[data-px-scheme][data-px-theme="spec-styles"][data-px-scheme="dark"] { --_px-theme-accent: #aaaaff; }',
    );
    expect(themeStyles(standardTheme)).toBe("");
  });
});

describe("the built-in themes", () => {
  test("refer to another token's value by its resolved property", () => {
    expect(token("foreground")).toBe("var(--_px-foreground)");
    expect(token("rowHeight")).toBe("var(--_px-row-height)");
  });

  test("make airy roomier in both schemes: taller rows, wider padding, a rule between rows instead of stripes", () => {
    for (const scheme of [airyTheme.light, airyTheme.dark]) {
      expect(scheme).toMatchObject({
        "cell-padding": "12px",
        "column-border": "transparent",
        "row-height": "30px",
        stripe: "transparent",
      });
      expect(scheme["row-border"]).toContain("var(--_px-foreground)");
    }
  });

  test("draw basis in @basis/ui's tokens, every chart slot and step of its scales included", () => {
    // The two schemes differ only in which of the card's colours is the light ink and which the dark.
    expect({ ...basisTheme.light, "dark-ink": "", "light-ink": "" }).toStrictEqual({
      ...basisTheme.dark,
      "dark-ink": "",
      "light-ink": "",
    });
    expect(basisTheme.light).toMatchObject({
      "dark-ink": "var(--card-foreground)",
      "light-ink": "var(--card)",
    });
    expect(basisTheme.dark).toMatchObject({
      "dark-ink": "var(--card)",
      "light-ink": "var(--card-foreground)",
    });
    expect(basisTheme.light).toMatchObject({
      "cell-padding": "var(--control-md-inset)",
      "header-height": "var(--control-lg-height)",
      "row-height": "var(--control-md-height)",
      accent: "var(--primary)",
      background: "var(--card)",
      "negative-ramp-1": "var(--div-7)",
      "negative-ramp-5": "var(--div-11)",
      "ramp-9": "var(--seq-9)",
      "series-8": "var(--chart-8)",
      up: "var(--gain)",
    });
  });
});

describe("the theming docs", () => {
  test("list every token in their reference", () => {
    const doc = readFileSync(new URL("../../docs/theming.md", import.meta.url), "utf8");
    const charts = /^--px-(?:series|ramp|negative-ramp)-\d$|^--px-(?:up|down|middle)$/u;
    for (const property of tokenProperties.filter((name) => !charts.test(name))) {
      expect(doc).toContain(`| \`${property}\` |`);
    }
  });
});
