// Writes src/styles/theme.css from src/theme. Run it with `vp run @basis/ui#theme` after changing the theme's inputs.
import { writeFileSync } from "node:fs";

import { themeCss } from "#theme/css.ts";

const target = new URL("../src/styles/theme.css", import.meta.url);
writeFileSync(target, themeCss());
process.stdout.write(`Wrote ${target.pathname}\n`);
