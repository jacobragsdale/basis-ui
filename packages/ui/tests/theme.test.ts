import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "@tailwindcss/node";
import { describe, expect, test } from "vite-plus/test";

import { checkTheme, themeFileProblems } from "#theme/check.ts";
import { defineTheme } from "#theme/inputs.ts";
import type { ChartColour, Charts, Hue, StepTone, ThemeInputs } from "#theme/inputs.ts";
import { defaultTheme, themes } from "#theme/themes/index.ts";
import { tokenNames } from "#theme/tokens.ts";

const source = new URL("../src/", import.meta.url).pathname;
const committed = readFileSync(path.join(source, "styles/theme.css"), "utf8");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const vp = path.join(root, "node_modules/.bin/vp");

/** The CSS Tailwind generates for `candidates` with the theme. */
async function build(candidates: readonly string[]): Promise<string> {
  const compiler = await compile(`@import "tailwindcss";\n@import "./styles/theme.css";\n`, {
    base: source,
    onDependency: () => {
      // Tailwind reports each file it reads; these tests watch none.
    },
  });
  return compiler.build([...candidates]);
}

test("every token is defined in both modes, and nothing outside theme.css defines one", () => {
  const [light, dark] = committed.split("\n.dark {");
  for (const name of tokenNames) {
    expect(light, `--${name} in :root`).toContain(`  --${name}: `);
    expect(dark, `--${name} in .dark`).toContain(`  --${name}: `);
  }
  const others = readdirSync(source, { encoding: "utf8", recursive: true })
    .filter((file) => file.endsWith(".css") && !file.endsWith("theme.css"))
    .filter((file) => /^\s*--[a-z]/mu.test(readFileSync(path.join(source, file), "utf8")));
  expect(others, "CSS files that declare custom properties").toEqual([]);
});

/** The default theme with one change, for a check to fail on. */
function changed(change: (theme: ThemeInputs) => Partial<ThemeInputs>): ThemeInputs {
  return defineTheme({ ...defaultTheme, ...change(defaultTheme), name: defaultTheme.name });
}

/** A hue's curve with one step at another lightness. */
function curveWith(hue: Hue, step: number, dark: number): readonly StepTone[] {
  return hue.curve.map((row) => (row.step === step ? { ...row, dark } : row));
}

/** The chart series with one colour changed. */
function seriesWith(
  charts: Charts,
  index: number,
  colour: Partial<ChartColour>,
): Charts["categorical"] {
  const categorical: [...Charts["categorical"]] = [...charts.categorical];
  const old = categorical[index];
  if (old !== undefined) {
    categorical[index] = { ...old, ...colour };
  }
  return categorical;
}

/** `checkTheme`'s lines for `theme`. */
function messagesOf(theme: ThemeInputs): readonly string[] {
  return checkTheme(theme).map(({ message }) => message);
}

describe("checkTheme", () => {
  test.each(themes)("the $name theme passes", (theme) => {
    expect(messagesOf(theme)).toStrictEqual([]);
  });

  test("text on every ground it sits on reaches 5.5:1, and a failure names the nearest lightness that passes", () => {
    const theme = changed(({ signed }) => ({
      signed: { ...signed, loss: { ...signed.loss, dark: 0.7 } },
    }));
    expect(messagesOf(theme)).toStrictEqual([
      "ERROR the default theme's dark loss on popover is 5.46:1, under the 5.5:1 text needs: set signed.loss.dark to 0.702 (5.51:1).",
      "ERROR the default theme's dark loss on muted is 4.96:1, under the 5.5:1 text needs: set signed.loss.dark to 0.725 (5.50:1).",
      "ERROR the default theme's dark loss on accent is 4.48:1, under the 5.5:1 text needs: set signed.loss.dark to 0.75 (5.51:1).",
      "ERROR the default theme's dark loss on secondary is 4.48:1, under the 5.5:1 text needs: set signed.loss.dark to 0.75 (5.51:1).",
      "ERROR the default theme's dark loss on selection is 4.96:1, under the 5.5:1 text needs: set signed.loss.dark to 0.725 (5.51:1).",
      "ERROR the default theme's dark loss on highlight is 5.00:1, under the 5.5:1 text needs: set signed.loss.dark to 0.723 (5.50:1).",
      "ERROR the default theme's dark loss on sidebar-accent is 4.96:1, under the 5.5:1 text needs: set signed.loss.dark to 0.725 (5.50:1).",
    ]);
  });

  test("the focus ring reaches 3:1 on what a focused control sits beside, and a failure names its hue's step", () => {
    const theme = changed(({ hues }) => ({
      hues: { ...hues, brand: { ...hues.brand, curve: curveWith(hues.brand, 8, 0.56) } },
    }));
    expect(messagesOf(theme)).toStrictEqual([
      "ERROR the default theme's dark ring on accent is 2.78:1, under the 3:1 a focus ring needs: set hues.brand's step 8 dark to 0.578 (3.00:1).",
    ]);
  });

  test("a chart series reaches 3:1 on what a chart sits on, and a failure names the nearest colour that passes", () => {
    const theme = changed(({ charts }) => ({
      charts: {
        ...charts,
        categorical: seriesWith(charts, 3, { light: "#eda100" }),
      },
    }));
    expect(messagesOf(theme)).toStrictEqual([
      "ERROR the default theme's light chart-4 on background is 2.05:1, under the 3:1 a chart's marks need: set charts.categorical[3].light to #c38400 (3.00:1).",
      "ERROR the default theme's light chart-4 on card is 2.12:1, under the 3:1 a chart's marks need: set charts.categorical[3].light to #c78600 (3.00:1).",
      "ERROR the default theme's light chart-4 on popover is 2.12:1, under the 3:1 a chart's marks need: set charts.categorical[3].light to #c78600 (3.00:1).",
    ]);
  });

  test("any two chart series stay 6 apart under each simulation, not only neighbours", () => {
    const theme = changed(({ charts }) => ({
      charts: {
        ...charts,
        categorical: seriesWith(charts, 5, { dark: "#d55181" }),
      },
    }));
    expect(messagesOf(theme)).toStrictEqual([
      "ERROR the default theme's dark chart-2 and chart-6 are 5.6 apart in OKLab ×100 under tritanopia, under the 6 any two series need: set charts.categorical[5].dark to #d14e7e (6.0).",
      "ERROR the default theme's dark chart-3 and chart-6 are 3.2 apart in OKLab ×100 under deuteranopia, under the 6 any two series need: set charts.categorical[5].dark to #cb4778 (6.1).",
    ]);
  });

  test("gain and loss differ in lightness and stay apart under each simulation", () => {
    const theme = changed(({ signed }) => ({
      signed: { ...signed, gain: { ...signed.gain, dark: 0.8 } },
    }));
    expect(messagesOf(theme)).toStrictEqual([
      "ERROR the default theme's dark gain and loss differ by 0.05 in lightness, under the 0.1 that tells them apart without hue: set signed.loss.dark to 0.699 (0.10).",
      "ERROR the default theme's dark gain and loss are 4.8 apart in OKLab ×100 under deuteranopia, under the 8 signed values need: set signed.loss.dark to 0.727 (8.1).",
    ]);
  });

  test("a fill hovered shows against its rest, and a failure names the surface's nearest step", () => {
    const theme = changed(({ surfaces }) => ({
      surfaces: { ...surfaces, light: { ...surfaces.light, secondaryHover: 4 } },
    }));
    expect(messagesOf(theme)).toStrictEqual([
      "ERROR the default theme's light secondary-hover and secondary are 0.0 apart in OKLab ×100, under the 2 a hovered fill needs to show: set surfaces.light.secondaryHover to 3 (2.3).",
    ]);
  });

  test("each problem names its theme, mode and the tokens it measured, the moved one first", () => {
    const theme = changed(({ hues }) => ({
      hues: { ...hues, brand: { ...hues.brand, curve: curveWith(hues.brand, 8, 0.56) } },
    }));
    expect(
      checkTheme(theme).map(({ mode, theme: name, tokens }) => ({ mode, name, tokens })),
    ).toStrictEqual([{ mode: "dark", name: "default", tokens: ["ring", "accent"] }]);
  });
});

describe("vp check holds every shipped theme to checkTheme", () => {
  test("a theme's file reports checkTheme's lines, and a file `themes` does not list says so", () => {
    const broken = changed(({ signed }) => ({
      signed: { ...signed, loss: { ...signed.loss, dark: 0.7 } },
    }));
    expect(themeFileProblems("/themes/default.ts", [broken])).toStrictEqual(messagesOf(broken));
    expect(themeFileProblems("/themes/default.ts", themes)).toStrictEqual([]);
    expect(themeFileProblems(String.raw`C:\themes\sea.ts`, themes)).toStrictEqual([
      "ERROR sea.ts defines a theme that `themes` in src/theme/themes/index.ts does not list, so it is in no stylesheet and no check: add it there, or name the theme after its file.",
    ]);
  });

  test("the root config's lint runs the rule on the themes' files", () => {
    const probe = new URL("../src/theme/themes/unlisted-probe.ts", import.meta.url);
    writeFileSync(
      probe,
      'import { defineTheme } from "#theme/inputs.ts";\n\nimport { theme as base } from "./default.ts";\n\nexport const theme = defineTheme({ ...base, name: "unlisted-probe" });\n',
    );
    let output = "";
    try {
      output = execFileSync(vp, ["lint", "--format", "json", fileURLToPath(probe)], {
        cwd: root,
        encoding: "utf8",
      });
    } catch (error) {
      output = error instanceof Error && "stdout" in error ? String(error.stdout) : String(error);
    } finally {
      rmSync(probe);
    }
    expect(output).toContain(
      "ERROR unlisted-probe.ts defines a theme that `themes` in src/theme/themes/index.ts does not list",
    );
  });
});

describe("the theme under Tailwind", () => {
  test("every token is a colour utility", async () => {
    const css = await build(tokenNames.map((name) => `bg-${name}`));
    for (const name of tokenNames) {
      expect(css, `bg-${name}`).toContain(`.bg-${name} {`);
    }
  });

  test("Tailwind's palette, blur and large shadows are gone, so their classes generate nothing", async () => {
    const removed = [
      "bg-pink-500",
      "text-white",
      "bg-black",
      "blur-sm",
      "backdrop-blur-md",
      "shadow-lg",
      "rounded-3xl",
    ];
    const css = await build(removed);
    for (const name of removed) {
      expect(css, name).not.toContain(`.${name} {`);
    }
  });

  test("the theme's own scales generate their utilities", async () => {
    const kept = [
      "shadow-sm",
      "shadow-md",
      "rounded-lg",
      "rounded-pill",
      "text-2xs",
      "font-mono",
      "p-4",
      "duration-popup",
      "duration-panel",
      "z-raised",
      "z-popup",
      "opacity-disabled",
    ];
    const css = await build(kept);
    for (const name of kept) {
      expect(css, name).toContain(`.${name} {`);
    }
  });

  test("min-h-target and min-w-target hold WCAG 2.2's 24 px target in either density", async () => {
    const css = await build(["min-h-target", "min-w-target"]);
    expect(css).toContain(".min-h-target {\n    min-height: var(--spacing-target);");
    expect(css).toContain(".min-w-target {\n    min-width: var(--spacing-target);");
    // A fixed 1.5rem, not a multiple of `--spacing`, which the compact density shrinks; 1rem is 16 px.
    expect(css).toContain("--spacing-target: 1.5rem;");
    const [, comfortable] = committed.split(':root[data-density="comfortable"] {');
    expect(comfortable, "the comfortable density's block").toBeDefined();
    expect(comfortable?.slice(0, comfortable.indexOf("}"))).not.toContain("--spacing-target");
  });

  test("the focus ring's width and offset, and the shadows, are variables a theme can change", async () => {
    const css = await build(["outline", "ring", "shadow-sm", "shadow-md"]);
    expect(css).toContain("outline-width: var(--focus-width);");
    expect(css).toContain("calc(var(--focus-width) + var(--tw-ring-offset-width))");
    expect(css).toContain("--tw-shadow: var(--shadow-raised);");
    expect(css).toContain("--tw-shadow: var(--shadow-floating);");
    // WCAG 2.2's focus appearance asks for a ring at least 2 px thick.
    expect(
      Number(/--focus-width: (?<px>[\d.]+)px;/u.exec(committed)?.groups?.["px"] ?? "0"),
    ).toBeGreaterThanOrEqual(2);
  });

  test("`dark:` follows the dark class, not the operating system", async () => {
    const css = await build(["dark:bg-card"]);
    expect(css).toContain(".dark");
    expect(css).not.toContain("prefers-color-scheme");
  });
});
