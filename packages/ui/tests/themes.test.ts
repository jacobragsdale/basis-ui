/* The stylesheet the themes make: the committed file is the shipped themes' output, and each theme beside the default
 * declares everything the default does, under its own `data-theme`. Only the default ships today, so the themes beside
 * it here are dummies, which `theme-selectors.test.ts` also uses. */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, test } from "vite-plus/test";

import { tabularFace, themeBlocks, themeCss, themeNamesModule } from "#theme/css.ts";
import { defineTheme } from "#theme/inputs.ts";
import { parallaxChartsModule } from "#theme/parallax-charts.ts";
import { startTheme } from "#theme/start-theme.ts";
import { defaultTheme, themes } from "#theme/themes/index.ts";

import { dummy, rulesOf, valueOf } from "./theme-dummies.ts";

const styles = new URL("../src/styles/", import.meta.url);

test("the committed theme.css is what the shipped themes produce (run `vp run @basis/ui#theme` after changing them)", () => {
  expect(readFileSync(new URL("theme.css", styles), "utf8")).toBe(themeCss(themes));
});

test("the tabular face's file, and its licence, are the package's (run `vp run @basis/ui#theme` after updating it)", () => {
  const require = createRequire(import.meta.url);
  expect(readFileSync(new URL(`fonts/${tabularFace.file}`, styles))).toStrictEqual(
    readFileSync(require.resolve(tabularFace.source)),
  );
  expect(readFileSync(new URL("fonts/LICENSE", styles), "utf8")).toBe(
    readFileSync(require.resolve("@fontsource-variable/inter/LICENSE"), "utf8"),
  );
});

test("parallax's committed chart colours are the default theme's (run `vp run @basis/ui#theme` after changing it)", () => {
  const charts = new URL("../../parallax/src/theme/charts.ts", import.meta.url);
  expect(readFileSync(charts, "utf8")).toBe(parallaxChartsModule(defaultTheme));
});

const sea = dummy("sea", 200);

test("the committed theme-names.ts names the shipped themes in their order (run `vp run @basis/ui#theme` after changing them)", () => {
  expect(readFileSync(new URL("../src/theme/theme-names.ts", import.meta.url), "utf8")).toBe(
    themeNamesModule(themes),
  );
  expect(themeNamesModule([defaultTheme, sea])).toContain(
    'const themeNames = ["default", "sea"] as const;',
  );
});

/** The variables the stylesheet's `@theme` block declares, other than those that clear a namespace and the library's
 * own, which are the same in every theme. */
function themeScaleNames(css: string): readonly string[] {
  const library = new Set([
    "--radius-pill",
    "--z-index-raised",
    "--z-index-popup",
    "--z-index-notice",
    "--spacing-target",
  ]);
  const block = /@theme \{(?<body>[^}]*)\}/u.exec(css)?.groups?.["body"] ?? "";
  return [...block.matchAll(/^\s*(?<name>--[a-z0-9-]+):(?! initial)/gmu)]
    .map((match) => match.groups?.["name"] ?? "")
    .filter((name) => !library.has(name));
}

/** The names a rule declares, sorted. */
function namesOf(
  rules: ReadonlyMap<string, ReadonlyMap<string, string>>,
  selector: string,
): readonly string[] {
  return [...(rules.get(selector)?.keys() ?? [])].toSorted();
}

describe("a theme beside the default", () => {
  const rules = rulesOf(themeBlocks([defaultTheme, sea]));
  const seaDark =
    '[data-theme="sea"].dark,\n.dark [data-theme="sea"],\n:where([data-theme="sea"]) .dark';
  const seaComfortable =
    '[data-theme="sea"][data-density="comfortable"],\n[data-density="comfortable"] [data-theme="sea"]';

  test("leaves the default's stylesheet as it was, and adds its rules after the default's", () => {
    const alone = themeBlocks([defaultTheme]);
    const both = themeBlocks([defaultTheme, sea]);
    expect(both.startsWith(`${alone}\n\n/* The sea theme`)).toBe(true);
    expect(themeCss([defaultTheme, sea])).toBe(themeCss([defaultTheme]).replace(alone, both));
  });

  test("declares in its base what the default declares at :root and in @theme, but the library's own scales", () => {
    const expected = [...namesOf(rules, ":root"), ...themeScaleNames(themeCss([defaultTheme]))];
    expect(namesOf(rules, '[data-theme="sea"]')).toEqual(expected.toSorted());
  });

  test("declares in its dark mode and its comfortable density what the default's do", () => {
    expect(namesOf(rules, seaDark)).toEqual(namesOf(rules, ".dark"));
    expect(namesOf(rules, seaComfortable)).toEqual(
      namesOf(rules, ':root[data-density="comfortable"]'),
    );
  });

  test("declares its own values", () => {
    const base = rules.get('[data-theme="sea"]');
    expect(base?.get("--radius")).toBe("2rem");
    expect(base?.get("--primary")).toBe(valueOf(sea, "light", "--primary"));
    expect(base?.get("--primary")).not.toBe(valueOf(defaultTheme, "light", "--primary"));
    expect(base?.get("--control-md-height")).toBe("2.5rem");
    expect(rules.get(seaDark)?.get("--primary")).toBe(valueOf(sea, "dark", "--primary"));
    expect(rules.get(seaDark)?.get("--shadow-raised")).toBe("none");
    expect(rules.get(seaComfortable)?.get("--control-md-height")).toBe("3.75rem");
  });

  test("refuses two themes of one name", () => {
    expect(() => themeCss([defaultTheme, sea, dummy("sea", 120)])).toThrow(
      /Two themes are named "sea"/u,
    );
  });
});

describe("defineTheme", () => {
  test("refuses a name that cannot be a data-theme value", () => {
    expect(() => defineTheme({ ...defaultTheme, name: "Sea Breeze" })).toThrow(/lower case words/u);
  });

  test("refuses a curve without its twelve steps in order", () => {
    const red = { ...defaultTheme.hues.red, curve: defaultTheme.hues.red.curve.slice(1) };
    expect(() => defineTheme({ ...defaultTheme, hues: { ...defaultTheme.hues, red } })).toThrow(
      /red curve has steps 2, 3/u,
    );
  });
});

/** A theme's inputs file after its opening comment, without its name. */
function withoutName(text: string): string {
  return text.slice(text.indexOf("\n\nimport ")).replace(/ {2}name: "[a-z-]+",\n/u, "");
}

test("a new theme's inputs file is the default's, with its name and its opening comment replaced", () => {
  const source = readFileSync(new URL("../src/theme/themes/default.ts", import.meta.url), "utf8");
  const started = startTheme(source, defaultTheme.name, "sea");
  expect(started).toMatch(/^\/\/ The sea theme, under data-theme="sea"\. It starts as a copy/u);
  expect(started).toContain('  name: "sea",\n');
  expect(started).not.toContain(`name: "${defaultTheme.name}"`);
  expect(withoutName(started)).toBe(withoutName(source));
});
