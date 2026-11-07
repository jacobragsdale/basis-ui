/* The app shell's own components: how an error is shown, in place and as a toast. BasisApp, which renders them, is
 * proved by packages/example, an app built on it. */

import type { ReactElement } from "react";

import { ErrorAlertSection } from "./app-shell/error-alert.tsx";
import { ErrorToastSection } from "./app-shell/error-toast.tsx";

function AppShell(): ReactElement {
  return (
    <>
      <ErrorAlertSection />
      <ErrorToastSection />
    </>
  );
}

export { AppShell };
