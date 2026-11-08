/* The app shell's own components: the environment banner, and how an error is shown, in place and as a toast.
 * AppShell itself runs on the next page, in an app of its own (app-in-shell.tsx), whose Toaster would otherwise show
 * this page's toasts twice. */

import type { ReactElement } from "react";

import { ErrorAlertSection } from "./app-shell/error-alert.tsx";
import { ErrorToastSection } from "./app-shell/error-toast.tsx";
import { EnvironmentBannerSection } from "./app-shell/shell-parts.tsx";

function AppShell(): ReactElement {
  return (
    <>
      <EnvironmentBannerSection />
      <ErrorAlertSection />
      <ErrorToastSection />
    </>
  );
}

export { AppShell };
