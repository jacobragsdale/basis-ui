/* `vp lint` in packages/consumer, the app configured exactly as the README says, on a probe of the preset's error
 * tests: as JSON, so CI's annotations do not drop the help, read by the line each finding is on. */

import { execFileSync } from "node:child_process";

import { z } from "zod";

const consumer = new URL("../../consumer/", import.meta.url);

const spanSchema = z.object({ line: z.number() });
const labelSchema = z.object({ span: spanSchema });
const diagnosticSchema = z.object({
  // A diagnostic of Oxlint's own, such as an unused directive's, has no code.
  code: z.string().default(""),
  help: z.string().optional(),
  labels: z.array(labelSchema),
  message: z.string(),
});
const reportSchema = z.object({ diagnostics: z.array(diagnosticSchema) });
type Diagnostic = z.infer<typeof diagnosticSchema>;

/** `vp lint`'s diagnostics in packages/consumer on `file`, a path in the app such as `src/positions.tsx`. */
function lintDiagnostics(file: string): Diagnostic[] {
  const vp = new URL("node_modules/.bin/vp", consumer).pathname;
  let output = "";
  try {
    output = execFileSync(vp, ["lint", "--format", "json", file], {
      cwd: consumer,
      encoding: "utf8",
    });
  } catch (error) {
    output = error instanceof Error && "stdout" in error ? String(error.stdout) : String(error);
  }
  const parsed: unknown = JSON.parse(output.slice(output.indexOf("{")));
  return reportSchema.parse(parsed).diagnostics;
}

/** For `found`, the diagnostics on `source`: what a rule reports on the line holding a text, each message with its
 * help after it. */
function findingsIn(found: Diagnostic[], source: string): (rule: string, text: string) => string[] {
  return (rule, text) => {
    const line = source.split("\n").findIndex((written) => written.includes(text)) + 1;
    return found
      .filter(({ code, labels }) => code === rule && labels.some(({ span }) => span.line === line))
      .map(({ help, message }) => (help === undefined ? message : `${message} ${help}`));
  };
}

/** What no-raw-colors says after the class it names, as `basis/theme-classes` says it of black and white. */
const rawColourText =
  "is not a colour or shadow of @basis/ui's theme, whose tokens follow the user's theme and mode: name a colour by what it means, as text-loss or bg-destructive for red, text-gain or bg-success for green, bg-warning for amber, bg-info or bg-primary for blue, text-muted-foreground, bg-muted or border-edge for grey, and text-foreground or bg-background for black and white; a status is a Badge or Alert variant, and a shadow shadow-sm or shadow-md.";

export { consumer, findingsIn, lintDiagnostics, rawColourText };
export type { Diagnostic };
