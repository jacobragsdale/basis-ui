/* The studio's export: a theme's inputs as its file, which loads back to the same inputs. */

import { expect, test } from "vite-plus/test";

import { scopedThemeCss } from "#theme/css.ts";
import { themeFile } from "#theme/theme-file.ts";
import { themes } from "#theme/themes/index.ts";

/** The inputs a theme's file defines, loaded as a module with `defineTheme` as the identity. */
async function loaded(source: string): Promise<unknown> {
  const module = source
    .replace(
      'import { defineTheme } from "#theme/inputs.ts";',
      "const defineTheme = (inputs) => inputs;",
    )
    .replace("export { theme };", "export default theme;");
  const loadedModule: unknown = await import(`data:text/javascript,${encodeURIComponent(module)}`);
  return typeof loadedModule === "object" && loadedModule !== null && "default" in loadedModule
    ? loadedModule.default
    : undefined;
}

test.each(themes)("the $name theme's file loads back to its inputs", async (theme) => {
  const source = themeFile(theme);
  expect(source).toContain(`name: "${theme.name}",`);
  expect(source).toContain('"2xs": {');
  await expect(loaded(source)).resolves.toStrictEqual(theme);
});

test("a theme's own rules sit under its name, with its dark mode and comfortable density", () => {
  const css = scopedThemeCss({ ...themes[0], name: "studio" });
  expect(css).toMatch(/^\[data-theme="studio"\] \{/u);
  expect(css).toContain('[data-theme="studio"].dark,');
  expect(css).toContain('[data-theme="studio"][data-density="comfortable"],');
});
