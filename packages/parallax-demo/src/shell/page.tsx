/* A demo page's frame: its header, with the sidebar's trigger, the page's title, what it shows off, and its own
 * actions, and below it the page's views, which either fill the window or scroll. */

import { SidebarTrigger } from "@basis/ui";
import { cn } from "cn";
import type { ReactNode } from "react";

import type { DemoPage } from "./pages.ts";

interface PageProps {
  readonly page: DemoPage;
  /** What the page's header holds beside its title, such as a link to the view. */
  readonly actions?: ReactNode;
  /** Whether the views scroll, for a page of many; otherwise they fill the window below the header. */
  readonly scrolls?: boolean;
  readonly children: ReactNode;
}

function Page({ page, actions, scrolls = false, children }: PageProps): ReactNode {
  return (
    <>
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <SidebarTrigger />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-base font-semibold">{page.title}</h1>
          <p className="max-w-5xl text-sm text-muted-foreground">{page.about}</p>
        </div>
        {actions}
      </header>
      <div
        data-slot="page-views"
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 p-3",
          scrolls ? "overflow-auto" : "overflow-hidden",
        )}
      >
        {children}
      </div>
    </>
  );
}

export { Page };
