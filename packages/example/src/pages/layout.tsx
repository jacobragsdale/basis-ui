/* The layout every page sits in: the app's name, which links to its start page, the signed-in user, and the page. */

import { Button, useSession, useTelemetry } from "@basis/ui";
import { Link, Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";

function Layout(): ReactElement {
  const { user, signOut } = useSession();
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "sign-out" });
  };
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <Link to="/" className="text-sm font-semibold">
          Positions
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {user === null ? (
            <span>Signed out</span>
          ) : (
            <>
              <span>{user.name}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  signOut().catch(report);
                }}
              >
                Sign out
              </Button>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <Outlet />
      </main>
    </div>
  );
}

export { Layout };
