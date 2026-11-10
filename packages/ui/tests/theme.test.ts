import { readdirSync, readFileSync } from "node:fs";
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

import { colourOf as colourIn } from "#theme/colours.ts";
import type { Mode } from "#theme/inputs.ts";
import { defaultTheme } from "#theme/themes/index.ts";
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

/** A token's colour in the default theme. */
function colourOf(name: string, mode: Mode): Color {
  return colourIn(defaultTheme, name, mode);
}

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
  ["primary-foreground", "primary-hover"],
  ["primary-foreground", "primary-active"],
  ["secondary-foreground", "secondary-hover"],
  ["secondary-foreground", "secondary-active"],
  ["primary", "background"],
  ["primary", "card"],
  ["sidebar-foreground", "sidebar"],
  // A sidebar group's label.
  ["muted-foreground", "sidebar"],
  // A key in a tooltip, which is drawn in `foreground` with `background` text.
  ["background", "muted-foreground"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ...["destructive", "success", "warning", "info"].flatMap((status) => [
    [`${status}-foreground`, status] as const,
    [status, "background"] as const,
    [status, "card"] as const,
    [status, `${status}-subtle`] as const,
    [status, `${status}-subtle-hover`] as const,
    ["foreground", `${status}-subtle`] as const,
  ]),
  ...["gain", "loss"].flatMap((signed) => [
    [signed, "background"] as const,
    [signed, "card"] as const,
  ]),
  ...["env-dev", "env-qa", "env-prod"].map((env) => [`${env}-foreground`, env] as const),
];
// The focus ring is drawn whole, outside the control, so it sits on the surface the control sits on. A switch that is
// off shows its track on the page and its thumb, in `background`, on the track.
const outlinePairs: readonly (readonly [outline: string, surface: string])[] = [
  ["input", "background"],
  ["input", "card"],
  ...["background", "card", "popover", "muted"].map((surface) => ["ring", surface] as const),
  ["sidebar-ring", "sidebar"],
  ...["background", "card", "popover"].map((surface) => ["control-off", surface] as const),
  ["background", "control-off"],
];

/* A fill hovered and pressed: each state must show against the one before it, as a fill against its surface. A status's
 * tint, pressed, returns to rest. */
const states: readonly (readonly [rest: string, hover: string, active: string])[] = [
  ...["primary", "secondary"].map((fill) => [fill, `${fill}-hover`, `${fill}-active`] as const),
  ...["destructive", "success", "warning", "info"].map(
    (status) => [`${status}-subtle`, `${status}-subtle-hover`, `${status}-subtle`] as const,
  ),
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

describe.each(modes)("hovered and pressed fills in %s mode", (mode) => {
  test.each(states)("%s, %s and %s each stand apart from the one before", (rest, hover, active) => {
    expect(delta(colourOf(hover, mode), colourOf(rest, mode))).toBeGreaterThanOrEqual(2);
    expect(delta(colourOf(active, mode), colourOf(hover, mode))).toBeGreaterThanOrEqual(2);
  });
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
