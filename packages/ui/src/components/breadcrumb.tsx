/* Breadcrumb and its parts, from shadcn's Base UI source. BreadcrumbLink renders through Base UI's `useRender`, so
 * `render` makes it the router's link component. A link keeps the 24 px target in the compact density, since a
 * breadcrumb's links sit apart from any sentence. shadcn flips the separator for right-to-left text; @basis/ui leaves
 * out right-to-left support, so the chevron stays as it is. */

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { ChevronRightIcon } from "#vendor/lucide/chevron-right.tsx";
import { EllipsisIcon } from "#vendor/lucide/ellipsis.tsx";

/** The trail of links to the current page: a navigation landmark named "breadcrumb".
 *
 * @use For a trail to the page built by hand. In an app on AppShell, RouteBreadcrumbs builds it from the routes.
 * @see RouteBreadcrumbs, DropdownMenu
 *
 * @example
 * ```tsx
 * import {
 *   Breadcrumb,
 *   BreadcrumbItem,
 *   BreadcrumbLink,
 *   BreadcrumbList,
 *   BreadcrumbPage,
 *   BreadcrumbSeparator,
 * } from "@basis/ui";
 *
 * <Breadcrumb>
 *   <BreadcrumbList>
 *     <BreadcrumbItem>
 *       <BreadcrumbLink href="/bonds">Bonds</BreadcrumbLink>
 *     </BreadcrumbItem>
 *     <BreadcrumbSeparator />
 *     <BreadcrumbItem>
 *       <BreadcrumbPage>US91282CRF04</BreadcrumbPage>
 *     </BreadcrumbItem>
 *   </BreadcrumbList>
 * </Breadcrumb>;
 * ```
 */
function Breadcrumb({ className, ...props }: ComponentProps<"nav">): ReactElement {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" className={className} {...props} />;
}

/** The ordered list of the trail's items and separators. */
function BreadcrumbList({ className, ...props }: ComponentProps<"ol">): ReactElement {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** One step of the trail: a `BreadcrumbLink`, or the `BreadcrumbPage` for the current page. */
function BreadcrumbItem({ className, ...props }: ComponentProps<"li">): ReactElement {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

/** A link to an earlier page: an `<a>`, or the router's link through `render`, as in
 * `<BreadcrumbLink render={<Link to="/desks" />}>Desks</BreadcrumbLink>`. */
function BreadcrumbLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">): ReactElement {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "inline-flex min-h-target min-w-target items-center transition-colors hover:text-foreground",
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: "breadcrumb-link" },
  });
}

/** The current page, which is not a link: marked `aria-current="page"`. shadcn also gives it `role="link"` and
 * `aria-disabled`, which announce a link that cannot be followed or focused; it is plain text here. */
function BreadcrumbPage({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  );
}

/** The mark between two items, a chevron unless it is given children. Assistive technology skips it. */
function BreadcrumbSeparator({
  children,
  className,
  ...props
}: ComponentProps<"li">): ReactElement {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  );
}

/** Stands for the items left out of a long trail, often as a menu's trigger. */
function BreadcrumbEllipsis({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-5 items-center justify-center [&>svg]:size-4", className)}
      {...props}
    >
      <EllipsisIcon />
      <span className="sr-only">More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
