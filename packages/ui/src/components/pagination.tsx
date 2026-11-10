/* Pagination and its parts, from shadcn's Base UI source. shadcn draws a page link as a Button rendering an `<a>`,
 * which keeps the button role; here it is a ButtonLink, which stays a link and takes `render` for the router's link
 * component, as in `<PaginationLink render={<Link to="/trades" search={{ page: 2 }} />}>2</PaginationLink>`. The
 * previous and next links lose shadcn's `pl-1.5!` and `pr-1.5!`, which would restyle the ButtonLink past
 * `shadcn/no-restyle`; their icons' `data-icon` sets that side's padding instead. `<nav>` drops shadcn's redundant
 * `role="navigation"`, and right-to-left flipping is left out, as @basis/ui does throughout.
 *
 * PaginationLink takes Button's `size`, so it imports Button's classes as `paginationLinkVariants`: `@shadcn/lint`
 * finds a component's variants by its name followed by `Variants`, so `shadcn/no-restyle`'s errors list the sizes. */

import type { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";
import { ChevronLeftIcon } from "#vendor/lucide/chevron-left.tsx";
import { ChevronRightIcon } from "#vendor/lucide/chevron-right.tsx";
import { EllipsisIcon } from "#vendor/lucide/ellipsis.tsx";

import { ButtonLink } from "./button-link.ts";
// oxlint-disable-next-line typescript/consistent-type-imports -- `@shadcn/lint` reads no type-only import, and this value import is how its errors on PaginationLink list Button's sizes.
import { buttonVariants as paginationLinkVariants } from "./button-variants.ts";

/** The pages' links: a navigation landmark named "pagination".
 *
 * @use For links between the pages of a list that the API pages. DataTable pages its own rows, and parallax's Grid
 * scrolls its rows instead.
 * @see DataTable, ButtonLink, Grid
 *
 * @example
 * ```tsx
 * import {
 *   Pagination,
 *   PaginationContent,
 *   PaginationItem,
 *   PaginationLink,
 *   PaginationNext,
 *   PaginationPrevious,
 * } from "@basis/ui";
 *
 * <Pagination>
 *   <PaginationContent>
 *     <PaginationItem>
 *       <PaginationPrevious href="?page=1" />
 *     </PaginationItem>
 *     <PaginationItem>
 *       <PaginationLink href="?page=2" isActive>
 *         2
 *       </PaginationLink>
 *     </PaginationItem>
 *     <PaginationItem>
 *       <PaginationNext href="?page=3" />
 *     </PaginationItem>
 *   </PaginationContent>
 * </Pagination>;
 * ```
 */
function Pagination({ className, ...props }: ComponentProps<"nav">): ReactElement {
  return (
    <nav
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

/** The row of the pagination's items. */
function PaginationContent({ className, ...props }: ComponentProps<"ul">): ReactElement {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  );
}

/** One item of the pagination: a link, the previous or next link, or an ellipsis. */
function PaginationItem(props: ComponentProps<"li">): ReactElement {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = useRender.ComponentProps<"a"> & {
  /** Whether the link is to the page shown, which it marks with `aria-current="page"` and the outline look. */
  readonly isActive?: boolean;
  /** Button's size; `icon` by default, a square for a page number. */
  readonly size?: VariantProps<typeof paginationLinkVariants>["size"];
};

/** A link to one page, drawn as a ghost ButtonLink, or an outline one for the page shown. */
function PaginationLink({
  isActive = false,
  size = "icon",
  ...props
}: PaginationLinkProps): ReactElement {
  return (
    <ButtonLink
      aria-current={isActive ? "page" : undefined}
      data-active={isActive}
      variant={isActive ? "outline" : "ghost"}
      size={size}
      {...props}
    />
  );
}

/** The link to the previous page, named "Go to previous page". Its text shows from the `sm` breakpoint up. */
function PaginationPrevious({
  text = "Previous",
  ...props
}: PaginationLinkProps & {
  /** The link's text beside its arrow: "Previous" by default. */
  readonly text?: string;
}): ReactElement {
  return (
    <PaginationLink aria-label="Go to previous page" size="default" {...props}>
      <ChevronLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  );
}

/** The link to the next page, named "Go to next page". Its text shows from the `sm` breakpoint up. */
function PaginationNext({
  text = "Next",
  ...props
}: PaginationLinkProps & {
  /** The link's text beside its arrow: "Next" by default. */
  readonly text?: string;
}): ReactElement {
  return (
    <PaginationLink aria-label="Go to next page" size="default" {...props}>
      <span className="hidden sm:block">{text}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  );
}

/** Stands for the pages left out between two links. Assistive technology skips it. */
function PaginationEllipsis({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
        className,
      )}
      {...props}
    >
      <EllipsisIcon />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
