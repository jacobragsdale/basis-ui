/* The axe check `vp run shot` runs on every page it pictures: the rules and Base UI's exceptions that
 * src/testing/axe-rules.ts holds, which `checkRoutes` and `expectAccessible` run in a test too. Each violation is one
 * ERROR line naming the rule, the element and the fix, and fails the shot. */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type axeCore from "axe-core";
import type { AxeResults, RunOptions } from "axe-core";
import type { Page } from "playwright";

import { axeExceptions, axeTags } from "#testing/axe-rules.ts";
import type { AxeException, AxeViolation } from "#testing/axe-rules.ts";

/** axe-core's script, added to each page. */
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

/** What the page runs: axe, then each element at fault that no exception covers. */
interface InPage {
  readonly options: RunOptions;
  readonly exceptions: readonly AxeException[];
}

/** Runs axe on the page as it stands, returning each element at fault that no exception covers. */
async function axeViolations(page: Page): Promise<readonly AxeViolation[]> {
  await page.addScriptTag({ content: axeSource });
  const options: RunOptions = {
    elementRef: true,
    runOnly: { type: "tag", values: axeTags },
  };
  return page.evaluate(
    async ({ options: given, exceptions }: InPage) => {
      const axe: unknown = Reflect.get(globalThis, "axe");
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends this function's source alone.
      const isAxe = (value: unknown): value is typeof axeCore =>
        typeof value === "object" && value !== null && "run" in value;
      if (!isAxe(axe)) {
        throw new Error("axe-core's script did not load into the page.");
      }
      const results: AxeResults = await axe.run(document, given);
      return results.violations.flatMap((violation) =>
        violation.nodes
          .filter(
            (node) =>
              !exceptions.some(
                ({ rule, selector }) =>
                  rule === violation.id && (node.element?.closest(selector) ?? null) !== null,
              ),
          )
          .map((node) => ({
            help: violation.help,
            helpUrl: violation.helpUrl,
            html: node.html,
            rule: violation.id,
            summary: node.failureSummary ?? "",
            target: node.target.map(String).join(" "),
          })),
      );
    },
    { exceptions: axeExceptions, options },
  );
}

export { axeViolations };
export { axeExceptions, axeTags, violationLine } from "#testing/axe-rules.ts";
export type { AxeException, AxeViolation } from "#testing/axe-rules.ts";
