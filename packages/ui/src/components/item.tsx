/* Item and its parts, from shadcn's Base UI source: a row of media, a title and description, and actions, for lists
 * of things such as accounts or saved views. Item renders through Base UI's `useRender`, so `render` can make the
 * whole row a link. */

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { itemMediaVariants, itemVariants } from "./item-variants.ts";
import { Separator } from "./separator.tsx";

/** A stack of items, with a gap that follows its items' size. shadcn gives it `role="list"`, which requires children
 * with the `listitem` role that an item, often a link, cannot take, so it is a plain group here. */
function ItemGroup({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="item-group"
      className={cn(
        "group/item-group flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2",
        className,
      )}
      {...props}
    />
  );
}

/** A line between two items in a group. */
function ItemSeparator({ className, ...props }: ComponentProps<typeof Separator>): ReactElement {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      className={cn("my-2", className)}
      {...props}
    />
  );
}

/** One item: a `<div>`, or the element `render` names, such as a link, with its variant and size as `data-variant`
 * and `data-size`. */
function Item({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> & VariantProps<typeof itemVariants>): ReactElement {
  const classes = cn(itemVariants({ size, variant }), className);
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">({ className: classes }, props),
    render,
    state: { size, slot: "item", variant },
  });
}

/** The item's icon or image, at its start. */
function ItemMedia({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>): ReactElement {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant }), className)}
      {...props}
    />
  );
}

/** The item's title and description, which take the room the media and actions leave. */
function ItemContent({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="item-content"
      className={cn(
        "flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none",
        className,
      )}
      {...props}
    />
  );
}

/** The item's title, on one line. */
function ItemTitle({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="item-title"
      className={cn(
        "line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4",
        className,
      )}
      {...props}
    />
  );
}

/** The item's description, cut at two lines. */
function ItemDescription({ className, ...props }: ComponentProps<"p">): ReactElement {
  return (
    <p
      data-slot="item-description"
      className={cn(
        "line-clamp-2 text-left text-sm leading-normal font-normal text-muted-foreground group-data-[size=xs]/item:text-xs [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

/** The item's buttons, at its end. */
function ItemActions({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div data-slot="item-actions" className={cn("flex items-center gap-2", className)} {...props} />
  );
}

/** A row across the item's full width, above its content. */
function ItemHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="item-header"
      className={cn("flex basis-full items-center justify-between gap-2", className)}
      {...props}
    />
  );
}

/** A row across the item's full width, below its content. */
function ItemFooter({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="item-footer"
      className={cn("flex basis-full items-center justify-between gap-2", className)}
      {...props}
    />
  );
}

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
};
