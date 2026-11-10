import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { compile } from "@tailwindcss/node";
import {
  converter,
  differenceEuclidean,
  filterDeficiencyDeuter,
  filterDeficiencyProt,
  filterDeficiencyTrit,
  wcagContrast,
} from "culori";
import type { Color } from "culori";
import { describe, expect, test } from "vite-plus/test";

import { colourOf, tabularFace, themeCss } from "#theme/css.ts";
import type { Mode } from "#theme/ramps.ts";
import { tokenNames } from "#theme/tokens.ts";

const modes: readonly Mode[] = ["light", "dark"];
const source = new URL("../src/", import.meta.url).pathname;
const committed = readFileSync(path.join(source, "styles/theme.css"), "utf8");

// OKLab distance scaled by 100, the scale the reference palette's thresholds use.
const distance = differenceEuclidean("oklab");
function delta(first: Color, second: Color): number {
  return distance(first, second) * 100;
}

const deficiencies = {
  deuteranopia: filterDeficiencyDeuter(1),
  protanopia: filterDeficiencyProt(1),
  tritanopia: filterDeficiencyTrit(1),
} as const;

const toOklch = converter("oklch");

function lightness(colour: Color): number {
  return toOklch(colour).l;
}

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

test("the committed theme.css is what the inputs produce (run `vp run @basis/ui#theme` after changing them)", () => {
  expect(committed).toBe(themeCss());
});

test("the tabular face's file, and its licence, are the package's (run `vp run @basis/ui#theme` after updating it)", () => {
  const require = createRequire(import.meta.url);
  const fonts = path.join(source, "styles/fonts");
  expect(readFileSync(path.join(fonts, tabularFace.file))).toStrictEqual(
    readFileSync(require.resolve(tabularFace.source)),
  );
  expect(readFileSync(path.join(fonts, "LICENSE"), "utf8")).toBe(
    readFileSync(require.resolve("@fontsource-variable/inter/LICENSE"), "utf8"),
  );
});

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

// Text pairs reach 5.5:1; control outlines and focus rings reach 3:1 against what they sit on.
const textPairs: readonly (readonly [text: string, surface: string])[] = [
  ...[
    "background",
    "card",
    "popover",
    "muted",
    "secondary",
    "accent",
    "selection",
    "highlight",
  ].map((surface) => ["foreground", surface] as const),
  ...["background", "card", "popover", "muted"].map(
    (surface) => ["muted-foreground", surface] as const,
  ),
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["primary-foreground", "primary"],
  ["primary", "background"],
  ["primary", "card"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ...["destructive", "success", "warning", "info"].flatMap((status) => [
    [`${status}-foreground`, status] as const,
    [status, "background"] as const,
    [status, "card"] as const,
    [status, `${status}-subtle`] as const,
    ["foreground", `${status}-subtle`] as const,
  ]),
  ...["gain", "loss"].flatMap((signed) => [
    [signed, "background"] as const,
    [signed, "card"] as const,
  ]),
  ...["env-dev", "env-qa", "env-prod"].map((env) => [`${env}-foreground`, env] as const),
];
const outlinePairs: readonly (readonly [outline: string, surface: string])[] = [
  ["input", "background"],
  ["input", "card"],
  ["ring", "background"],
  ["ring", "card"],
  ["sidebar-ring", "sidebar"],
];

/* A fill must show on every surface it can sit on, or a muted band or a highlighted menu item vanishes in a popup.
 * 2 is about one just-noticeable difference in OKLab's scale; a quiet fill needs no more. */
const fills = ["muted", "secondary", "accent"] as const;
const surfaces = ["background", "card", "popover"] as const;

describe.each(modes)("fills in %s mode", (mode) => {
  test.each(fills.flatMap((fill) => surfaces.map((surface) => [fill, surface] as const)))(
    "%s stands apart from %s",
    (fill, surface) => {
      expect(delta(colourOf(fill, mode), colourOf(surface, mode))).toBeGreaterThanOrEqual(2);
    },
  );
});

describe.each(modes)("contrast in %s mode", (mode) => {
  test.each(textPairs)("%s on %s reaches 5.5:1", (text, surface) => {
    expect(wcagContrast(colourOf(text, mode), colourOf(surface, mode))).toBeGreaterThanOrEqual(5.5);
  });
  test.each(outlinePairs)("%s on %s reaches 3:1", (outline, surface) => {
    expect(wcagContrast(colourOf(outline, mode), colourOf(surface, mode))).toBeGreaterThanOrEqual(
      3,
    );
  });
});

describe.each(modes)("chart colours in %s mode", (mode) => {
  const series = Array.from({ length: 8 }, (_slot, index) =>
    colourOf(`chart-${String(index + 1)}`, mode),
  );
  const adjacent = series.slice(1).map((colour, index) => ({
    first: series[index],
    firstNumber: index + 1,
    second: colour,
    secondNumber: index + 2,
  }));

  test.each(adjacent)(
    "chart-$firstNumber and chart-$secondNumber stay 15 apart to normal vision",
    ({ first, second }) => {
      if (first === undefined) {
        throw new Error("The chart series list is shorter than eight.");
      }
      expect(delta(first, second)).toBeGreaterThanOrEqual(15);
    },
  );

  test.each(Object.entries(deficiencies))(
    "adjacent series stay 8 apart under %s",
    (_name, simulate) => {
      for (const { first, second } of adjacent) {
        if (first === undefined) {
          throw new Error("The chart series list is shorter than eight.");
        }
        expect(delta(simulate(first), simulate(second))).toBeGreaterThanOrEqual(8);
      }
    },
  );
});

describe.each(modes)("gain and loss in %s mode", (mode) => {
  const gain = colourOf("gain", mode);
  const loss = colourOf("loss", mode);

  test("they differ in lightness by at least 0.1", () => {
    expect(Math.abs(lightness(gain) - lightness(loss))).toBeGreaterThanOrEqual(0.1);
  });

  test.each(Object.entries(deficiencies))("they stay 8 apart under %s", (_name, simulate) => {
    expect(delta(simulate(gain), simulate(loss))).toBeGreaterThanOrEqual(8);
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
    const kept = ["shadow-sm", "shadow-md", "rounded-lg", "text-2xs", "font-mono", "p-4"];
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
    const [, compact] = committed.split(':root[data-density="compact"] {');
    expect(compact?.slice(0, compact.indexOf("}"))).not.toContain("--spacing-target");
  });

  test("`dark:` follows the dark class, not the operating system", async () => {
    const css = await build(["dark:bg-card"]);
    expect(css).toContain(".dark");
    expect(css).not.toContain("prefers-color-scheme");
  });
});
