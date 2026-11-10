// Writes src/styles/theme.css from every shipped theme in src/theme/themes, and copies beside it the font file its
// tabular face names. Run it with `vp run @basis/ui#theme` after changing a theme's inputs or updating
// @fontsource-variable/inter. `vp run @basis/ui#theme new NAME` starts a theme's inputs file from the default's.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { tabularFace, themeCss } from "#theme/css.ts";
import { defineTheme } from "#theme/inputs.ts";
import { startTheme } from "#theme/start-theme.ts";
import { defaultTheme, themes } from "#theme/themes/index.ts";

const themesFolder = new URL("../src/theme/themes/", import.meta.url);

/** Writes `themes/NAME.ts` from the default's inputs file, with its name and its opening comment replaced. */
function startThemeFile(name: string | undefined): void {
  if (name === undefined) {
    throw new TypeError("Name the theme: vp run @basis/ui#theme new NAME");
  }
  // The name's rules are defineTheme's.
  defineTheme({ ...defaultTheme, name });
  const target = new URL(`${name}.ts`, themesFolder);
  if (existsSync(target) || themes.some((theme) => theme.name === name)) {
    throw new RangeError(`A theme named "${name}" exists already, at ${target.pathname}.`);
  }
  const source = readFileSync(new URL("default.ts", themesFolder), "utf8");
  writeFileSync(target, startTheme(source, defaultTheme.name, name));
  process.stdout.write(
    `Wrote ${target.pathname}\nAdd it to \`themes\` in ${new URL("index.ts", themesFolder).pathname}, then run vp run @basis/ui#theme.\n`,
  );
}

/** Writes the stylesheet, and copies the tabular face's file and its licence beside it. */
function writeThemes(): void {
  const target = new URL("../src/styles/theme.css", import.meta.url);
  writeFileSync(target, themeCss(themes));
  process.stdout.write(
    `Wrote ${target.pathname} with ${themes.map((theme) => theme.name).join(", ")}\n`,
  );

  /* The tabular face is a second @font-face of Inter's own file, which a stylesheet can name only by a relative URL: an
     app's bundler resolves none into a package. So the file, and its licence, are copied from the package. */
  const require = createRequire(import.meta.url);
  const fonts = new URL("../src/styles/fonts/", import.meta.url);
  mkdirSync(fonts, { recursive: true });
  for (const [from, to] of [
    [tabularFace.source, tabularFace.file],
    ["@fontsource-variable/inter/LICENSE", "LICENSE"],
  ] as const) {
    copyFileSync(require.resolve(from), new URL(to, fonts));
    process.stdout.write(`Copied ${from} to ${new URL(to, fonts).pathname}\n`);
  }
}

const [command, name, ...rest] = process.argv.slice(2);
if (command === undefined) {
  writeThemes();
} else if (command === "new" && rest.length === 0) {
  startThemeFile(name);
} else {
  throw new TypeError(
    `Unknown arguments: ${process.argv.slice(2).join(" ")}. Run vp run @basis/ui#theme to write the themes, or vp run @basis/ui#theme new NAME to start one.`,
  );
}
