// A theme's inputs as the file that holds them, `src/theme/themes/NAME.ts`: what the gallery's studio exports, for
// whoever ports a brand to add to `themes` and run `vp run @basis/ui#theme` on.

import type { ThemeInputs } from "./inputs.ts";

/** A key that needs no quotes in TypeScript. */
const bareKey = /^(?<indent>\s*)"(?<key>[A-Za-z_$][\w$]*)":/gmu;

/** The inputs file of `inputs`: its opening comment, `defineTheme`'s import, and the inputs as one call to it. `vp
 * fmt` lays the values out as the repo's files are. */
function themeFile(inputs: ThemeInputs): string {
  const values = JSON.stringify(inputs, null, 2).replaceAll(bareKey, "$<indent>$<key>:");
  return `// The ${inputs.name} theme, under data-theme="${inputs.name}", made in the gallery's theme studio. Add it to \`themes\`
// in ./index.ts and run \`vp run @basis/ui#theme\`; \`vp check\` then reports at this file whatever fails \`checkTheme\`.

import { defineTheme } from "#theme/inputs.ts";

const theme = defineTheme(${values});

export { theme };
`;
}

export { themeFile };
