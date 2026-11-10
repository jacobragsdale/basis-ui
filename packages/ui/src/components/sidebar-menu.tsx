/* Sidebar's menus, from shadcn's Base UI source: the list of menu items, each a SidebarMenuButton
 * (sidebar-menu-button.tsx) with an optional action and badge, its skeleton while loading, and its sub-menu. The
 * action and sub-buttons keep the 24 px target in the compact density; the action is centred on its button's height
 * rather than set at shadcn's fixed offsets, which assumed a smaller action. The skeleton's width comes from the
 * item's place rather than shadcn's `Math.random()`, so a screenshot shows it the same each time. */

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { useId } from "react";
import type { ComponentProps, ReactElement } from "react";

import { Skeleton } from "./skeleton.tsx";

/** A list of the sidebar's menu items.
 *
 * @use For a sidebar of links built by hand. In an app on AppShell, AppSidebar builds it from the routes.
 * @see AppSidebar, AppShell, Collapsible
 *
 * @example
 * ```tsx
 * import {
 *   Sidebar,
 *   SidebarContent,
 *   SidebarGroup,
 *   SidebarGroupContent,
 *   SidebarGroupLabel,
 *   SidebarInset,
 *   SidebarMenu,
 *   SidebarMenuButton,
 *   SidebarMenuItem,
 *   SidebarProvider,
 *   SidebarTrigger,
 * } from "@basis/ui";
 *
 * <SidebarProvider>
 *   <Sidebar>
 *     <SidebarContent>
 *       <SidebarGroup>
 *         <SidebarGroupLabel>Books</SidebarGroupLabel>
 *         <SidebarGroupContent>
 *           <SidebarMenu>
 *             <SidebarMenuItem>
 *               <SidebarMenuButton isActive render={<a href="/positions" />}>
 *                 Positions
 *               </SidebarMenuButton>
 *             </SidebarMenuItem>
 *           </SidebarMenu>
 *         </SidebarGroupContent>
 *       </SidebarGroup>
 *     </SidebarContent>
 *   </Sidebar>
 *   <SidebarInset>
 *     <SidebarTrigger />
 *   </SidebarInset>
 * </SidebarProvider>;
 * ```
 */
function SidebarMenu({ className, ...props }: ComponentProps<"ul">): ReactElement {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0", className)}
      {...props}
    />
  );
}

/** One item of a sidebar menu, holding a `SidebarMenuButton` and, optionally, a submenu. */
function SidebarMenuItem({ className, ...props }: ComponentProps<"li">): ReactElement {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

type SidebarMenuActionProps = useRender.ComponentProps<"button"> & {
  /** Shows the action only while its item is hovered or focused, from the `md` breakpoint up. */
  readonly showOnHover?: boolean | undefined;
};

/** A button at the end of a menu item, such as one that opens the item's menu; name it with `aria-label`. */
function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: SidebarMenuActionProps): ReactElement {
  const classes = cn(
    "absolute top-4 right-1 flex aspect-square w-5 min-h-target min-w-target -translate-y-1/2 items-center justify-center rounded-md p-0 text-sidebar-foreground focus-visible:outline-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=lg]/menu-button:top-6 peer-data-[size=sm]/menu-button:top-3.5 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
    showOnHover &&
      "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0",
    className,
  );
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">({ className: classes }, props),
    render,
    state: { sidebar: "menu-action", slot: "sidebar-menu-action" },
  });
}

/** A count or short label at the end of a menu item. */
function SidebarMenuBadge({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1",
        className,
      )}
      {...props}
    />
  );
}

/** The skeleton text's narrowest width, and how much wider it may be, in percent. */
const skeletonBase = 50;
const skeletonSpread = 40;
const hashMultiplier = 31;

/** A width from 50 to 89 percent that follows `id`, so each skeleton row differs but stays the same between renders. */
function skeletonWidth(id: string): string {
  let hash = 0;
  for (const character of id) {
    hash = (hash * hashMultiplier + (character.codePointAt(0) ?? 0)) % skeletonSpread;
  }
  return `${String(skeletonBase + hash)}%`;
}

type SidebarMenuSkeletonProps = ComponentProps<"div"> & {
  /** Draws an icon's place before the text. */
  readonly showIcon?: boolean | undefined;
};

/** A menu item's place while the menu loads. */
function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: SidebarMenuSkeletonProps): ReactElement {
  const width = skeletonWidth(useId());
  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon ? <Skeleton data-sidebar="menu-skeleton-icon" className="size-4" /> : null}
      <Skeleton
        data-sidebar="menu-skeleton-text"
        style={{ "--skeleton-width": width }}
        className="h-4 max-w-(--skeleton-width) flex-1"
      />
    </div>
  );
}

/** A menu item's sub-menu, indented under it and hidden on the icon rail. */
function SidebarMenuSub({ className, ...props }: ComponentProps<"ul">): ReactElement {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

/** One item of a sidebar submenu, holding a `SidebarMenuSubButton`. */
function SidebarMenuSubItem({ className, ...props }: ComponentProps<"li">): ReactElement {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  );
}

type SidebarMenuSubButtonProps = useRender.ComponentProps<"a"> & {
  /** How large the link's text is drawn. */
  readonly size?: "sm" | "md" | undefined;
  /** Marks the link as the current page's, with `data-active`. */
  readonly isActive?: boolean | undefined;
};

/** A sub-menu's link: an `<a>`, or the router's link through `render`. */
function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: SidebarMenuSubButtonProps): ReactElement {
  const classes = cn(
    "flex h-7 min-h-target min-w-target -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground focus-visible:outline-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-disabled aria-disabled:pointer-events-none aria-disabled:opacity-disabled data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-[size=md]:text-sm data-[size=sm]:text-xs [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
    className,
  );
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">({ className: classes }, props),
    render,
    state: { active: isActive, sidebar: "menu-sub-button", size, slot: "sidebar-menu-sub-button" },
  });
}

export {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
};
