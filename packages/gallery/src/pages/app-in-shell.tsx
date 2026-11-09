/* AppShell as an app runs it, in BasisApp: the sidebar, breadcrumbs, user menu, command palette and shortcuts, built
 * from the framed app's routes. It has a page of its own, since BasisApp brings its own Toaster. BasisApp keeps the page
 * in the stored mode and density, so the page tells it those its query names, which a screenshot asks for. */

import { readPreferences } from "@basis/ui";
import type { ReactElement } from "react";

import { queryPreferences } from "#preferences.ts";

import { AppShellSection } from "./app-shell/shell-parts.tsx";

function AppInShell(): ReactElement {
  const asked = queryPreferences(globalThis.location.search, readPreferences());
  return <AppShellSection preferences={asked ?? undefined} />;
}

export { AppInShell };
