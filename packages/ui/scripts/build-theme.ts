// Writes src/styles/theme.css from src/theme, and copies beside it the font file its tabular face names. Run it with
// `vp run @basis/ui#theme` after changing the theme's inputs or updating @fontsource-variable/inter.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { tabularFace, themeCss } from "#theme/css.ts";

const target = new URL("../src/styles/theme.css", import.meta.url);
writeFileSync(target, themeCss());
process.stdout.write(`Wrote ${target.pathname}\n`);

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
