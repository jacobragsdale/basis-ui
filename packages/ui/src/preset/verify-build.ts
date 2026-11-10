/* `vp run verify`'s build: Vite's `build()`, as `vp build` runs it, in a Node of its own in the app's root, which
 * writes each error the bundler throws, with its file, line and code, as JSON, rather than the framed text a terminal
 * shows. The build fails on what only the React Compiler or the bundler finds. */

import { z } from "zod";

import { findingOf } from "./verify-report.ts";
import type { Finding } from "./verify-report.ts";
import {
  firstLine,
  fromRoot,
  jsonIn,
  runNode,
  unread,
  withReportFile,
  writtenTo,
} from "./verify-tools.ts";

/** The build, as a module Node runs from the app's root, so `vite-plus` is the app's own; it writes the errors to the
 * file `BASIS_VERIFY_OUT` names, and exits, since a plugin may leave a worker running. */
const buildScript = `
import { writeFileSync } from "node:fs";
const { build } = await import("vite-plus");
let errors = [];
try {
  await build({ logLevel: "silent" });
} catch (error) {
  const list = Array.isArray(error?.errors) && error.errors.length > 0 ? error.errors : [error];
  errors = list.map((each) => ({
    code: each?.code ?? null,
    file: each?.loc?.file ?? each?.id ?? null,
    line: each?.loc?.line ?? null,
    message: String(each?.message ?? each),
    plugin: each?.plugin ?? null,
  }));
}
writeFileSync(process.env.BASIS_VERIFY_OUT, JSON.stringify({ errors }));
process.exit(0);
`;

const buildErrorSchema = z.object({
  code: z.string().nullable(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  message: z.string(),
  plugin: z.string().nullable(),
});
const buildReportSchema = z.object({ errors: z.array(buildErrorSchema) });
type BuildError = z.infer<typeof buildErrorSchema>;

const buildFix =
  "fix the module the build names, keeping each component to the rules of React where the React Compiler names one, then run vp run verify --stage build.";

function buildFinding(root: string, error: BuildError): Finding {
  // The bundler opens its message with its code, as `[UNRESOLVED_IMPORT] `, which the rule gives.
  const message = firstLine(error.message).replace(/^\[[A-Z_]+\] /u, "");
  return findingOf({
    file: error.file === null ? null : fromRoot(root, error.file.replace(/\?.*$/u, "")),
    fix: buildFix,
    line: error.line,
    message: message === "" ? "the build failed" : message,
    rule: error.code ?? error.plugin,
  });
}

/** Each error the app's build throws, after which `dist/` holds no build to weigh. */
function buildFindings(root: string): readonly Finding[] {
  return withReportFile("build.json", (output) => {
    const ran = runNode(root, ["--input-type=module", "--eval", buildScript], {
      BASIS_VERIFY_OUT: output,
    });
    const report = buildReportSchema.safeParse(jsonIn(writtenTo(output)));
    return report.success
      ? report.data.errors.map((error) => buildFinding(root, error))
      : unread("vp build", ran);
  });
}

export { buildFindings };
