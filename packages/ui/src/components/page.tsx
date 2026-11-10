/* Page: one page of an app inside AppShell, its title and what it is for in a header with its actions, and below it
 * the page's content, which either scrolls under the header or fills the window, as a grid or a pivot does. */

import { cn } from "cn";
import { useId } from "react";
import type { ReactElement, ReactNode } from "react";

import { usePageCrumb } from "./page-crumb.ts";

interface PageProps {
  /** The page's title, its one level-1 heading. */
  readonly title: string;
  /** A line under the title on what the page shows. */
  readonly description?: ReactNode;
  /** The page's own buttons and menus, at the header's end, such as "Export" or "Book a trade". */
  readonly actions?: ReactNode;
  /** How the content takes the height below the header: `scroll`, a column that scrolls, for cards, forms and small
   * tables; or `fill`, the window's height and no more, for a grid, a pivot or a chart, which fills it and scrolls
   * itself; other content takes the height with `flex-1`.
   * @default "scroll" */
  readonly layout?: "scroll" | "fill";
  /** The page's breadcrumb from its data, such as the bond's name on `/bonds/$security` once its query has it, in
   * place of the route's title; the route's title while it is `undefined`. */
  readonly breadcrumb?: string | undefined;
  /** The page's content, in a column with the theme's gap. */
  readonly children?: ReactNode;
}

/** A page of the app in AppShell: a header with its title, description and actions, and its content, which scrolls
 * or fills the window. Its `breadcrumb` titles the last breadcrumb from its data.
 *
 * @use For every page an app's route shows inside AppShell: the shell keeps the sidebar and breadcrumbs, the page its
 * header and content. Give a grid's, pivot's or chart's page `layout="fill"`. For a heading inside a page, use
 * TypographyH2 or a Card's title.
 * @see AppShell, RouteBreadcrumbs, useShortcut, Button
 *
 * @example
 * ```tsx
 * import { Button, Card, CardContent, Page } from "@basis/ui";
 *
 * // A page that fills the window: its one child takes the height with flex-1, as a grid would.
 * <Page
 *   title="Trades"
 *   description="The desk's trades today, newest first."
 *   actions={<Button variant="outline">Export</Button>}
 *   layout="fill"
 * >
 *   <Card className="flex-1">
 *     <CardContent>The trades</CardContent>
 *   </Card>
 * </Page>;
 * ```
 */
function Page({
  title,
  description,
  actions,
  layout = "scroll",
  breadcrumb,
  children,
}: PageProps): ReactElement {
  usePageCrumb(breadcrumb);
  const titleId = useId();
  const scrolls = layout === "scroll";
  return (
    <div data-slot="page" data-layout={layout} className="flex min-h-0 flex-1 flex-col">
      <header
        data-slot="page-header"
        className="flex shrink-0 flex-wrap items-start gap-x-4 gap-y-2 border-b px-4 py-3"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 id={titleId} className="text-lg font-semibold">
            {title}
          </h1>
          {description === undefined ? null : (
            <p className="max-w-5xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div data-slot="page-actions" className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </header>
      <div
        data-slot="page-content"
        // A column that scrolls takes the focus, so the keyboard can scroll it when nothing in it takes the focus.
        {...(scrolls ? { "aria-labelledby": titleId, role: "region", tabIndex: 0 } : {})}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-4 p-4",
          scrolls
            ? "overflow-y-auto outline-none *:shrink-0 focus-visible:outline-solid focus-visible:outline focus-visible:-outline-offset-(--focus-width) focus-visible:outline-ring"
            : "overflow-hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export { Page };
export type { PageProps };
