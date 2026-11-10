/* The app shell's own components: the environment banner, Page, the command palette, the list of keyboard shortcuts,
 * and how an error is shown, in place and as a toast. AppShell itself runs on the next page, in an app of its own
 * (app-in-shell.tsx), whose Toaster would otherwise show this page's toasts twice. The page holds one
 * ShortcutProvider, as AppShell does, so ? opens one list. */

import { ShortcutProvider } from "@basis/ui";
import type { ReactElement } from "react";

import { ErrorAlertSection } from "./app-shell/error-alert.tsx";
import { ErrorToastSection } from "./app-shell/error-toast.tsx";
import {
  CommandPaletteSection,
  KeyboardShortcutsSection,
  PageSection,
} from "./app-shell/shell-pages.tsx";
import { EnvironmentBannerSection } from "./app-shell/shell-parts.tsx";

function AppShell(): ReactElement {
  return (
    <ShortcutProvider>
      <EnvironmentBannerSection />
      <PageSection />
      <CommandPaletteSection />
      <KeyboardShortcutsSection />
      <ErrorAlertSection />
      <ErrorToastSection />
    </ShortcutProvider>
  );
}

export { AppShell };
