/* The gallery's pages, one per component family in the design's order, then the app shell's and the icons. A
 * family's agent owns its page and the page's test, so families built at once never edit the same file. */

import type { ReactElement } from "react";

import { AppInShell } from "./pages/app-in-shell.tsx";
import { AppShell } from "./pages/app-shell.tsx";
import { Data } from "./pages/data.tsx";
import { FeedbackAndDisplay } from "./pages/feedback-and-display.tsx";
import { FormsAndInputs } from "./pages/forms-and-inputs.tsx";
import { Icons } from "./pages/icons.tsx";
import { NavigationAndLayout } from "./pages/navigation-and-layout.tsx";
import { NumbersAndDates } from "./pages/numbers-and-dates.tsx";
import { OverlaysAndMenus } from "./pages/overlays-and-menus.tsx";
import { SmallChartsAndStates } from "./pages/small-charts-and-states.tsx";

interface GalleryPage {
  /** The page's value in the `page` query parameter. */
  readonly id: string;
  readonly title: string;
  readonly Content: () => ReactElement;
}

const pages: readonly [GalleryPage, ...GalleryPage[]] = [
  { Content: FormsAndInputs, id: "forms-and-inputs", title: "Forms and inputs" },
  { Content: OverlaysAndMenus, id: "overlays-and-menus", title: "Overlays and menus" },
  { Content: NavigationAndLayout, id: "navigation-and-layout", title: "Navigation and layout" },
  { Content: FeedbackAndDisplay, id: "feedback-and-display", title: "Feedback and display" },
  { Content: NumbersAndDates, id: "numbers-and-dates", title: "Numbers and dates" },
  { Content: Data, id: "data", title: "Data" },
  {
    Content: SmallChartsAndStates,
    id: "small-charts-and-states",
    title: "Small charts and states",
  },
  { Content: AppShell, id: "app-shell", title: "App shell" },
  { Content: AppInShell, id: "app-in-shell", title: "An app in the shell" },
  { Content: Icons, id: "icons", title: "Icons" },
];

/** The page a query asks for with `?page=`, or the first page. */
function pageFor(search: string): GalleryPage {
  const id = new URLSearchParams(search).get("page");
  return pages.find((page) => page.id === id) ?? pages[0];
}

export { pageFor, pages };
export type { GalleryPage };
