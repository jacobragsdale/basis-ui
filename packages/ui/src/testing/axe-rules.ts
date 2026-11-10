/* The axe check every basis-ui page is held to, wherever it runs: `vp run shot` in Chromium (src/preset/shot-axe.ts),
 * and `checkRoutes` and `expectAccessible` in a test (axe.ts). It runs WCAG 2.2's rules at levels A and AA, which the
 * firm's apps must meet, and axe's best practices, as the gallery's shots run them (packages/gallery/tests/shots/axe.ts
 * in basis-ui). Each violation is one ERROR line naming the rule, the element and the fix.
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
 * The gallery's other exceptions are its own: it frames a whole app inside its page, which an app never does.
 *
 * This module imports nothing, so a page, a test and the preset's Node scripts can all read it. */

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

/** What a violation reads as after `ERROR`: the rule, the element, what the rule asks, and the fix axe gives. */
function violationText(violation: AxeViolation): string {
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
  return `axe ${violation.rule} at ${violation.target}, ${html}: ${violation.help} (${violation.helpUrl}): ${fix}`;
}

/** The one line a violation is. */
function violationLine(violation: AxeViolation): string {
  return `ERROR ${violationText(violation)}`;
}

export { axeExceptions, axeTags, violationLine, violationText };
export type { AxeException, AxeViolation };
