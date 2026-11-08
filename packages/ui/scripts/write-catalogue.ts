// Writes catalogue.json, the component catalogue, from the package's source. Run it with `vp run @basis/ui#catalogue`
// after changing a component's props, docs or example; a test fails while it is stale.
import { writeFileSync } from "node:fs";

import { catalogueText } from "#catalogue/build.ts";

const target = new URL("../catalogue.json", import.meta.url);
writeFileSync(target, catalogueText());
process.stdout.write(`Wrote ${target.pathname}\n`);
