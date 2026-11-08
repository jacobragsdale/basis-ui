/* AppShell as an app runs it, in BasisApp: the sidebar, breadcrumbs, user menu, command palette and shortcuts, built
 * from the framed app's routes. It has a page of its own, since BasisApp brings its own Toaster. */

import type { ReactElement } from "react";

import { AppShellSection } from "./app-shell/shell-parts.tsx";

function AppInShell(): ReactElement {
  return <AppShellSection />;
}

export { AppInShell };
