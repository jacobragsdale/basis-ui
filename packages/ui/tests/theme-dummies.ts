/* Dummy themes for the tests of several themes, and helpers that read the plain CSS the generator writes. */

import { themeBlocks } from "#theme/css.ts";
import { defineTheme } from "#theme/inputs.ts";
import type { Mode, ThemeInputs } from "#theme/inputs.ts";
import { defaultTheme } from "#theme/themes/index.ts";

// A dummy's `md` control heights, in pixels, before the tenth of its brand hue that tells it from another dummy.
const comfortableHeight = 40;
const compactHeight = 20;
const hueToPixels = 10;

/** A dummy theme: the default with another brand hue, base radius and `md` control height, all from `brandHue`, and
 * no shadows in dark mode, so that each of its values can be told from the default's and from another dummy's. */
function dummy(name: string, brandHue: number): ThemeInputs {
  const { comfortable, compact } = defaultTheme.controls;
  return defineTheme({
    ...defaultTheme,
    controls: {
      comfortable: {
        ...comfortable,
        md: { ...comfortable.md, height: comfortableHeight + brandHue / hueToPixels },
      },
      compact: {
        ...compact,
        md: { ...compact.md, height: compactHeight + brandHue / hueToPixels },
      },
    },
    hues: { ...defaultTheme.hues, brand: { ...defaultTheme.hues.brand, hue: brandHue } },
    name,
    radius: { ...defaultTheme.radius, base: `${String(brandHue / 100)}rem` },
    shadows: { ...defaultTheme.shadows, dark: { floating: "none", raised: "none" } },
  });
}

/** The declarations of each rule in plain CSS, by its selector, comments left out. */
function rulesOf(css: string): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const rules = new Map<string, ReadonlyMap<string, string>>();
  const withoutComments = css.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
  for (const match of withoutComments.matchAll(/(?<selector>[^{}]+)\{(?<body>[^{}]*)\}/gu)) {
    const declarations = new Map<string, string>();
    for (const line of (match.groups?.["body"] ?? "").split(";")) {
      const colon = line.indexOf(":");
      if (colon !== -1) {
        declarations.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
      }
    }
    rules.set((match.groups?.["selector"] ?? "").trim(), declarations);
  }
  return rules;
}

/** A theme's own value of a variable in a mode, from the theme generated alone, at `:root`. */
function valueOf(theme: ThemeInputs, mode: Mode, name: string): string | undefined {
  const rules = rulesOf(themeBlocks([theme]));
  return (
    rules.get(mode === "light" ? ":root" : ".dark")?.get(name) ?? rules.get(":root")?.get(name)
  );
}

export { dummy, rulesOf, valueOf };
