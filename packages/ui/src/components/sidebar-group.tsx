/* Sidebar's groups, from shadcn's Base UI source: a section of the sidebar with its label, an action beside the label,
 * and its content. The label and action render through Base UI's `useRender`, so `render` can make the label a
 * Collapsible's trigger. On the icon rail the label fades and moves away at once, where shadcn also animates its
 * margin. The action keeps the 24 px target in the compact density, centred on the label as shadcn's smaller one is. */

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

function SidebarGroup({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

/** The group's heading, hidden on the icon rail. */
function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): ReactElement {
  const classes = cn(
    "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-opacity group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
    className,
  );
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">({ className: classes }, props),
    render,
    state: { sidebar: "group-label", slot: "sidebar-group-label" },
  });
}

/** A button beside the group's label, such as one that adds an item; name it with `aria-label` or `sr-only` text. */
function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button">): ReactElement {
  const classes = cn(
    "absolute top-6 right-3 flex aspect-square w-5 min-h-target min-w-target -translate-y-1/2 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
    className,
  );
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">({ className: classes }, props),
    render,
    state: { sidebar: "group-action", slot: "sidebar-group-action" },
  });
}

function SidebarGroupContent({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

export { SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel };
