import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { compile } from "@tailwindcss/node";
import {
  differenceEuclidean,
  filterDeficiencyDeuter,
  filterDeficiencyProt,
  filterDeficiencyTrit,
  type Color,
  converter,
  wcagContrast,
} from "culori";
import { describe, expect, test } from "vite-plus/test";

import { colourOf, themeCss } from "../src/theme/css.ts";
import type { Mode } from "../src/theme/ramps.ts";
import { tokenNames } from "../src/theme/tokens.ts";

const modes: readonly Mode[] = ["light", "dark"];
const source = new URL("../src/", import.meta.url).pathname;
const committed = readFileSync(join(source, "styles/theme.css"), "utf8");

// OKLab distance scaled by 100, the scale the reference palette's thresholds use.
const distance = differenceEuclidean("oklab");
function delta(a: Color, b: Color): number {
  return distance(a, b) * 100;
}

const deficiencies = {
  protanopia: filterDeficiencyProt(1),
  deuteranopia: filterDeficiencyDeuter(1),
  tritanopia: filterDeficiencyTrit(1),
} as const;

const toOklch = converter("oklch");

function lightness(colour: Color): number {
  return toOklch(colour).l;
}

test("the committed theme.css is what the inputs produce (run `vp run @basis/ui#theme` after changing them)", () => {
  expect(committed).toBe(themeCss());
});

test("every token is defined in both modes, and nothing outside theme.css defines one", () => {
  const [light, dark] = committed.split("\n.dark {");
  for (const name of tokenNames) {
    expect(light, `--${name} in :root`).toContain(`  --${name}: `);
    expect(dark, `--${name} in .dark`).toContain(`  --${name}: `);
  }
  const others = readdirSync(source, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".css") && !path.endsWith("theme.css"))
    .filter((path) => /^\s*--[a-z]/m.test(readFileSync(join(source, path), "utf8")));
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
  const series = Array.from({ length: 8 }, (_, index) =>
    colourOf(`chart-${String(index + 1)}`, mode),
  );
  const adjacent = series
    .slice(1)
    .map((colour, index) => [index + 1, index + 2, series[index], colour] as const);

  test.each(adjacent)(
    "chart-%i and chart-%i stay 15 apart to normal vision",
    (_a, _b, first, second) => {
      if (first === undefined) {
        throw new Error("The chart series list is shorter than eight.");
      }
      expect(delta(first, second)).toBeGreaterThanOrEqual(15);
    },
  );

  test.each(Object.entries(deficiencies))(
    "adjacent series stay 8 apart under %s",
    (_name, simulate) => {
      for (const [, , first, second] of adjacent) {
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
  async function build(candidates: readonly string[]): Promise<string> {
    const compiler = await compile(`@import "tailwindcss";\n@import "./styles/theme.css";\n`, {
      base: source,
      onDependency: () => {},
    });
    return compiler.build([...candidates]);
  }

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

  test("`dark:` follows the dark class, not the operating system", async () => {
    const css = await build(["dark:bg-card"]);
    expect(css).toContain(".dark");
    expect(css).not.toContain("prefers-color-scheme");
  });
});
