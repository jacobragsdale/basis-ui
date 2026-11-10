/* Empty and its parts, from shadcn's Base UI source (its base-nova style): what a view shows when it has nothing to
 * show, such as a blotter with no trades today. Two changes: the dashed border is a variant, as empty-variants.ts says,
 * and EmptyTitle drops shadcn's `font-heading`, a font the theme does not define. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { emptyMediaVariants, emptyVariants } from "./empty-variants.ts";

/** An empty state, centred in the space it fills: EmptyHeader, then EmptyContent for what to do next. `outline` draws
 * a dashed border round it.
 *
 * @use For a page or a panel with nothing to show yet, saying why and what to do next. For a query, QueryState shows
 * one itself.
 * @see QueryState, Button, ButtonLink
 *
 * @example
 * ```tsx
 * import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@basis/ui";
 *
 * <Empty>
 *   <EmptyHeader>
 *     <EmptyTitle>No trades today</EmptyTitle>
 *     <EmptyDescription>Trades booked today show here.</EmptyDescription>
 *   </EmptyHeader>
 *   <EmptyContent>
 *     <Button variant="outline">Book a trade</Button>
 *   </EmptyContent>
 * </Empty>;
 * ```
 */
function Empty({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof emptyVariants>): ReactElement {
  return (
    <div
      data-slot="empty"
      data-variant={variant}
      className={cn(emptyVariants({ variant }), className)}
      {...props}
    />
  );
}

/** The media, title and description. */
function EmptyHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-2", className)}
      {...props}
    />
  );
}

/** An illustration, or an icon on a tile with `variant="icon"`. */
function EmptyMedia({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>): ReactElement {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant }), className)}
      {...props}
    />
  );
}

/** The empty state's title. */
function EmptyTitle({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-sm font-medium tracking-tight", className)}
      {...props}
    />
  );
}

/** A line under the empty state's title saying why it is empty and what to do. */
function EmptyDescription({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

/** What the user can do next, such as a Button that clears the filters. */
function EmptyContent({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-sm text-balance",
        className,
      )}
      {...props}
    />
  );
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
