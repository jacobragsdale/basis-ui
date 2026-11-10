/* The axe check `vp run shot` runs on every page it pictures: WCAG 2.2's rules at levels A and AA, which the firm's
 * apps must meet, and axe's best practices, as the gallery's shots run them (packages/gallery/tests/shots/axe.ts in
 * basis-ui). Each violation is one ERROR line naming the rule, the element and the fix, and fails the shot.
 *
 * Base UI does four things axe flags in every app, so each is excepted by its rule and a CSS selector the element at
 * fault, or one of its ancestors, matches, and nowhere else:
 *
 * - `region` inside `[data-base-ui-portal]`: Base UI portals an open popup that is no dialog, a menu's, a listbox's, a
 *   tooltip's or a preview card's, to the end of the body, outside every landmark; its trigger names or controls it.
 * - `aria-hidden-focus` at `[data-base-ui-focus-guard]`: the empty aria-hidden spans either side of an open popup,
 *   which pass focus into it and back out, are focusable by design.
 * - `aria-hidden-focus` and `page-has-heading-one` while a combobox's list is open: Base UI hides the rest of the page
 *   from screen readers, as a modal popup does, though Tab still leaves the input, which closes the list.
 * - `aria-hidden-focus` in `[role="alertdialog"][aria-hidden="true"]`: Base UI hides a high-priority toast from
 *   screen readers until it has focus, having announced it through its own alert; Tab still reaches its close button.
 *
 * The gallery's other exceptions are its own: it frames a whole app inside its page, which an app never does. */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type axeCore from "axe-core";
import type { AxeResults, RunOptions } from "axe-core";
import type { Page } from "playwright";

/** The rules' tags: WCAG 2.0 to 2.2 at A and AA, and axe's best practices. */
const axeTags = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
  "best-practice",
];

/** A violation Base UI causes in every app: its rule, a selector the element or an ancestor matches, and why. */
interface AxeException {
  readonly rule: string;
  readonly selector: string;
  readonly reason: string;
}

const comboboxOpen = ':root:has([role="combobox"][aria-expanded="true"])';
const comboboxHidesThePage =
  "Base UI hides the rest of the page from screen readers while a combobox's list is open; Tab closes the list";

const axeExceptions: readonly AxeException[] = [
  {
    reason:
      "Base UI portals the open popup, which is no dialog, to the body, outside every landmark; its trigger leads to it",
    rule: "region",
    selector: "[data-base-ui-portal]",
  },
  {
    reason:
      "Base UI's focus guards, empty aria-hidden spans that pass focus into the open popup and back, are focusable by design",
    rule: "aria-hidden-focus",
    selector: "[data-base-ui-focus-guard]",
  },
  { reason: comboboxHidesThePage, rule: "aria-hidden-focus", selector: comboboxOpen },
  { reason: comboboxHidesThePage, rule: "page-has-heading-one", selector: comboboxOpen },
  {
    reason:
      "Base UI hides a high-priority toast from screen readers until it has focus, having announced it through its own alert; Tab still reaches its close button",
    rule: "aria-hidden-focus",
    selector: '[role="alertdialog"][aria-hidden="true"]',
  },
];

/** One element at fault: the rule, what it asks, where it explains, the element, and axe's account of the fix. */
interface AxeViolation {
  readonly rule: string;
  readonly help: string;
  readonly helpUrl: string;
  readonly target: string;
  readonly html: string;
  readonly summary: string;
}

/** The longest stretch of an element's HTML a line quotes. */
const htmlLength = 120;

/** The one line a violation is: the rule, the element, what the rule asks, and the fix axe gives. */
function violationLine(violation: AxeViolation): string {
  const html =
    violation.html.length > htmlLength ? `${violation.html.slice(0, htmlLength)}…` : violation.html;
  // axe's summary is a heading, "Fix any of the following:", and a line for each way to fix it, maybe twice.
  let fix = "";
  for (const part of violation.summary.split("\n")) {
    const words = part.trim().replace(/^Fix/u, "fix");
    if (words !== "") {
      fix = fix === "" || fix.endsWith(":") ? `${fix} ${words}`.trim() : `${fix}; ${words}`;
    }
  }
  return `ERROR axe ${violation.rule} at ${violation.target}, ${html}: ${violation.help} (${violation.helpUrl}): ${fix}`;
}

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

export { axeExceptions, axeTags, axeViolations, violationLine };
export type { AxeException, AxeViolation };
