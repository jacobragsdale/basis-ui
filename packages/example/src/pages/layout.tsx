/* The layout every page sits in: the app's name, which links to its start page, the link to record a settlement, the
 * signed-in user with "Sign out", or "Sign in" for an anonymous one, and the page. */

import { Button, ButtonLink, useSession, useTelemetry } from "@basis/ui";
import { Link, Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";

function Layout(): ReactElement {
  const { user, signIn, signOut } = useSession();
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "sign-in" });
  };
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <nav aria-label="Pages" className="flex items-center gap-4">
          <Link to="/" className="text-sm font-semibold">
            Accruals
          </Link>
          <ButtonLink render={<Link to="/settlements/new" />} size="sm" variant="ghost">
            Record a settlement
          </ButtonLink>
        </nav>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{user === null ? "Signed out" : user.name}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              (user === null ? signIn() : signOut()).catch(report);
            }}
          >
            {user === null ? "Sign in" : "Sign out"}
          </Button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <Outlet />
      </main>
    </div>
  );
}

export { Layout };
