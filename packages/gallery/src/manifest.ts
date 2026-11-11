/* What the screenshots, which run in Node and render nothing of React, know of the gallery: its pages by their value
 * in the `page` query parameter, in the design's order, which pages.ts gives content; the themes they are shot in; and the errors it logs on
 * purpose, which the screenshots and the render matrix allow and no other. */

const pageIds = [
  "forms-and-inputs",
  "overlays-and-menus",
  "navigation-and-layout",
  "feedback-and-display",
  "numbers-and-dates",
  "data",
  "small-charts-and-states",
  "app-shell",
  "app-in-shell",
  "icons",
  "tokens",
] as const;

type PageId = (typeof pageIds)[number];

/** The themes @basis/ui ships, the default first, which every section is shot in; a test holds them to the
 * library's `themeNames`. */
const themeIds = ["default", "desk", "high-contrast"] as const;

type ThemeId = (typeof themeIds)[number];

/** Errors a section logs on purpose: DataTable past its row cap fails, as it must, and BasisApp's telemetry, here
 * the console, reports it. */
const expectedErrors: readonly RegExp[] = [/past DataTable's cap of 2,000/u];

export { expectedErrors, pageIds, themeIds };
export type { PageId, ThemeId };
