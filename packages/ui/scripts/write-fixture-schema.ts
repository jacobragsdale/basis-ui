// Writes schema/fixture-record.schema.json from src/fixtures/record.ts. Run it with `vp run @basis/ui#fixture-schema`
// after changing the fixture record format.
import { writeFileSync } from "node:fs";

import { fixtureRecordJsonSchema } from "#fixtures/record.ts";

const target = new URL("../schema/fixture-record.schema.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(fixtureRecordJsonSchema(), undefined, 2)}\n`);
process.stdout.write(`Wrote ${target.pathname}\n`);
