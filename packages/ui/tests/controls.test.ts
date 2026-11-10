/* The control lengths of each density: whole pixels, a height for each size that rises from WCAG 2.2's 24 px target, and
 * icons no shorter than the capitals beside them, which the gallery's browser test measures on every control. */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";

import type { ControlSize } from "#theme/inputs.ts";
import { defaultTheme } from "#theme/themes/index.ts";

const source = new URL("../src/", import.meta.url).pathname;
const committed = readFileSync(path.join(source, "styles/theme.css"), "utf8");

// Inter's capitals are 0.727 em tall and lucide draws in 20 of its 24 units.
const smallestIcon = 0.727 / (20 / 24);

const { controls } = defaultTheme;

const densities = [
  ["compact", controls.compact],
  ["comfortable", controls.comfortable],
] as const;

type Sizes = (typeof densities)[number][1];

/** Each size's lengths, smallest first, with the font size of its text. */
function bySize(sizes: Sizes): readonly (readonly [string, ControlSize, number])[] {
  return [
    ["xs", sizes.xs, 12],
    ["sm", sizes.sm, 12],
    ["md", sizes.md, 14],
    ["lg", sizes.lg, 14],
  ];
}

test("the base is the compact density, the default, and comfortable is under its attribute", () => {
  expect(committed).toContain("--spacing: 0.1875rem;");
  expect(committed).not.toContain('[data-density="compact"]');
  const [, comfortable = ""] = committed.split(':root[data-density="comfortable"] {');
  expect(comfortable.slice(0, comfortable.indexOf("}"))).toContain("--spacing: 0.25rem;");
});

describe("the control lengths", () => {
  test.each(densities)("are whole pixels in the %s density", (_density, sizes) => {
    for (const [, lengths] of bySize(sizes)) {
      const all = [
        lengths.gap,
        lengths.height,
        lengths.icon,
        lengths.inset,
        lengths.insetBesideIcon,
      ];
      expect(all.every((length) => Number.isInteger(length))).toBe(true);
    }
  });

  test.each(densities)(
    "rise from size to size in the %s density, from WCAG 2.2's 24 px target up",
    (_density, sizes) => {
      const heights = bySize(sizes).map(([, { height }]) => height);
      expect(heights[0]).toBeGreaterThanOrEqual(24);
      expect(heights).toStrictEqual(heights.toSorted((first, second) => first - second));
      expect(new Set(heights).size).toBe(heights.length);
    },
  );

  test.each(densities)(
    "draw icons no shorter than the capitals beside them in the %s density",
    (_density, sizes) => {
      for (const [size, { icon }, text] of bySize(sizes)) {
        expect(icon, size).toBeGreaterThanOrEqual(smallestIcon * text);
      }
    },
  );

  test("are variables in each density, with the indent of a control's text past an icon", () => {
    const [compact = "", comfortable = ""] = committed.split(':root[data-density="comfortable"] {');
    for (const block of [compact, comfortable.slice(0, comfortable.indexOf("}"))]) {
      expect(block).toContain("--control-md-height:");
      expect(block).toContain("--control-md-indent:");
    }
    // 8 + 16 + 6 pixels in the comfortable density; 6 + 14 + 4 in the compact.
    expect(comfortable).toContain("--control-md-indent: 1.875rem;");
    expect(compact).toContain("--control-md-indent: 1.5rem;");
  });
});
