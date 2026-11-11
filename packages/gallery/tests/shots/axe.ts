/* What the axe check runs on every section: the WCAG 2.2 rules at levels A and AA, which the firm's apps must meet, and
 * axe's best practices. A rule turned off is listed here with its reason, for the sections it is off for, and nowhere
 * else. */

import type { RunOptions } from "axe-core";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa", "best-practice"];

/** The gallery frames a whole app in this section, as an app runs it: the app's own `main` sits inside the section's
 * region and the gallery's `main`, two mains with no names. An app's page holds one `main`, at the top level, which
 * these rules check, and the gallery's test of the shell's landmarks (app-shell/landmarks.test.tsx) holds AppShell to
 * them outside a frame. */
const appInAFrame =
  "the section frames a whole app, whose main landmark sits inside the gallery's own";

/** Base UI portals a popup that is not a dialog, a menu's, a listbox's, a tooltip's or a preview card's, to the end of
 * the body, outside every landmark, in every app. Its trigger names or controls it, which is how a screen reader
 * reaches it. */
const portalledPopup =
  "Base UI portals the open popup, which is no dialog, to the body, outside every landmark; its trigger leads to it";

/** Base UI's focus guards: empty spans with tabindex 0 and aria-hidden on either side of an open popup, which pass
 * focus on into it or back out of it. They hold no content, and are never focused for long. */
const focusGuards =
  "Base UI's focus guards, empty aria-hidden spans that pass focus into the open popup and back, are focusable by design";

/** While a combobox's list is open, Base UI hides the rest of the page from screen readers, as a modal popup does,
 * though Tab still leaves the input, which closes the list and shows the page again. */
const comboboxHidesThePage =
  "Base UI hides the rest of the page from screen readers while a combobox's list is open; Tab closes the list";

/** Rules off for one section, by its `data-shot` id, each with its reason. */
const exceptions: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "app-shell": {
    "landmark-main-is-top-level": appInAFrame,
    "landmark-no-duplicate-main": appInAFrame,
    "landmark-unique": appInAFrame,
  },
  combobox: {
    "aria-hidden-focus": comboboxHidesThePage,
    "page-has-heading-one": comboboxHidesThePage,
    region: portalledPopup,
  },
  "context-menu": { region: portalledPopup },
  "dropdown-menu": { region: portalledPopup },
  "error-toast": {
    "aria-hidden-focus":
      "Base UI hides a high-priority toast from screen readers until it has focus, having announced it through its own alert; Tab still reaches its close button, which shows it again",
  },
  "hover-card": { region: portalledPopup },
  menubar: { region: portalledPopup },
  savedviews: { region: portalledPopup },
  "navigation-menu": { "aria-hidden-focus": focusGuards },
  select: { region: portalledPopup },
  tooltip: { region: portalledPopup },
};

/** Axe's options for a section shown alone. */
function axeOptions(section: string): RunOptions {
  const off = Object.keys(exceptions[section] ?? {});
  return {
    rules: Object.fromEntries(off.map((rule) => [rule, { enabled: false }])),
    runOnly: { type: "tag", values: tags },
  };
}

export { axeOptions };
