/* axe in a test: the rules and Base UI's exceptions `vp run shot` runs (axe-rules.ts), on the DOM the test rendered.
 * A test runs in a Node DOM, which has no layout, or in Chromium without the app's stylesheet, so axe's rules that
 * measure the page as drawn are left to `vp run shot`, which pictures it styled: colour contrast, a link told apart by
 * its colour, the size of a target, and a region that scrolls. Leaving them out in both keeps a test's verdict the same
 * with a browser or without. What it does check is the most of WCAG an agent breaks: names, labels, roles, ARIA,
 * landmarks, headings, lists, tables, ids and focus. A Node DOM also reads an element a class would hide as shown.
 *
 * The rules that read the page's own document, its title, language and viewport, are left to `vp run shot` too, since
 * a test's document is the test runner's, never the app's index.html. A check of one element rather than the whole
 * document also leaves out `region`, since a component a test renders alone sits in no landmark. */

import type axeCore from "axe-core";
import type { AxeResults, ElementContext, RunOptions } from "axe-core";

import { axeExceptions, axeTags, violationLine } from "./axe-rules.ts";
import type { AxeViolation } from "./axe-rules.ts";

/** The rules about index.html, which a test does not load. */
const documentRules = [
  "document-title",
  "html-has-lang",
  "html-lang-valid",
  "html-xml-lang-mismatch",
  "meta-refresh",
  "meta-viewport",
  "meta-viewport-large",
];

/** The rules that measure the page as drawn, which needs its layout and its stylesheet. */
const layoutRules = [
  "color-contrast",
  "link-in-text-block",
  "scrollable-region-focusable",
  "target-size",
];

/** The rules that hold a whole page, its content in landmarks, which an element alone is not. */
const pageRules = ["region"];

/** axe-core, loaded once, and only by a test that checks. */
const loaded: { axe?: Promise<typeof axeCore> } = {};

async function loadAxe(): Promise<typeof axeCore> {
  const { default: axe } = await import("axe-core");
  return axe;
}

/** Whether `element`, or one of its ancestors, matches `selector`; `false` for a selector this DOM cannot read. */
function within(element: Element | undefined, selector: string): boolean {
  try {
    return (element?.closest(selector) ?? null) !== null;
  } catch {
    return false;
  }
}

/** Each element at fault in `context`, the whole document by default, that no exception covers. */
async function axeViolations(context: Document | Element = document): Promise<AxeViolation[]> {
  loaded.axe ??= loadAxe();
  const axe = await loaded.axe;
  const off = [...documentRules, ...layoutRules, ...(context instanceof Element ? pageRules : [])];
  const options: RunOptions = {
    elementRef: true,
    resultTypes: ["violations"],
    rules: Object.fromEntries(off.map((rule) => [rule, { enabled: false }])),
    runOnly: { type: "tag", values: axeTags },
  };
  const target: ElementContext = context;
  const results: AxeResults = await axe.run(target, options);
  return results.violations.flatMap((violation) =>
    violation.nodes
      .filter(
        (node) =>
          !axeExceptions.some(
            ({ rule, selector }) => rule === violation.id && within(node.element, selector),
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
}

/** Fails, with one `ERROR` line for each element at fault, when axe finds `container` breaks a rule the firm's apps
 * are held to: WCAG 2.2 at A and AA and axe's best practices, less Base UI's known exceptions, as `vp run shot` runs
 * them. Without `container` it checks the whole document, landmarks included, as after `renderApp`; with one, such as
 * the `container` `render` returns, only what is inside it.
 *
 * It checks what needs no layout or stylesheet, in a Node DOM and in Chromium alike: names, labels, roles, ARIA,
 * landmarks, headings, lists, tables, ids and focus. Colour contrast and the size of a target need the page drawn
 * with its styles, and `vp run shot` checks them.
 *
 * @example
 * ```tsx
 * const { container } = render(<Button>Save</Button>);
 * await expectAccessible(container);
 * ```
 */
async function expectAccessible(container?: Document | Element): Promise<void> {
  const violations = await axeViolations(container);
  if (violations.length > 0) {
    throw new Error(violations.map((violation) => violationLine(violation)).join("\n"));
  }
}

export { axeViolations, expectAccessible };
