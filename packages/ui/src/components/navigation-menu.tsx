/* Navigation Menu and its parts, from shadcn's Base UI source: a row of links and triggers whose menus open in one
 * popup below them. shadcn animates the popup with tw-animate-css's keyframes, which @basis/ui does not carry, and
 * with 350 ms slides and size changes; here the popup fades and scales slightly and the content slides a step towards
 * the newly opened item, over the theme's short transition, which stops under reduced motion. The popup no longer
 * animates its size and position, since that lays the page out on every frame. shadcn's `data-viewport` classes,
 * left over from Radix, have no counterpart in Base UI and are gone. The trigger's chevron takes its size, place
 * and turn from the trigger, as `shadcn/no-restyle` requires.
 *
 * Base UI moves focus between the top-level items with the arrow keys, opens a menu with Enter, Space or the down
 * arrow, and closes it with Escape. */

import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu";
import { cn } from "cn";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";
import { ChevronDownIcon } from "#vendor/lucide/chevron-down.tsx";

import {
  navigationMenuLinkVariants,
  navigationMenuTriggerVariants,
} from "./navigation-menu-variants.ts";

/** The gap between the list and the popup, in pixels, which the positioner's hover bridge spans. */
const popupOffset = 8;

/** Where the menus' popup opens: below the list, at its start by default. NavigationMenu renders one already. */
function NavigationMenuPositioner({
  className,
  side = "bottom",
  sideOffset = popupOffset,
  align = "start",
  alignOffset = 0,
  ...props
}: NavigationMenuPrimitive.Positioner.Props): ReactElement {
  return (
    <NavigationMenuPrimitive.Portal>
      <NavigationMenuPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className={cn(
          "isolate z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) data-[side=bottom]:before:absolute data-[side=bottom]:before:inset-x-0 data-[side=bottom]:before:-top-2 data-[side=bottom]:before:h-2",
          className,
        )}
        {...props}
      >
        <NavigationMenuPrimitive.Popup className="relative h-(--popup-height) w-(--popup-width) origin-(--transform-origin) rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 transition outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <NavigationMenuPrimitive.Viewport className="relative size-full overflow-hidden" />
        </NavigationMenuPrimitive.Popup>
      </NavigationMenuPrimitive.Positioner>
    </NavigationMenuPrimitive.Portal>
  );
}

/** A site's top-level navigation: a navigation landmark holding a NavigationMenuList. `align` places the popup
 * against the list. */
function NavigationMenu({
  align = "start",
  className,
  children,
  ...props
}: NavigationMenuPrimitive.Root.Props &
  Pick<NavigationMenuPrimitive.Positioner.Props, "align">): ReactElement {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      className={cn(
        "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
        className,
      )}
      {...props}
    >
      {children}
      <NavigationMenuPositioner align={align} />
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({
  className,
  ...props
}: NavigationMenuPrimitive.List.Props): ReactElement {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn("group flex flex-1 list-none items-center justify-center gap-0", className)}
      {...props}
    />
  );
}

/** One top-level item: a trigger and its content, or a link. */
function NavigationMenuItem({
  className,
  ...props
}: NavigationMenuPrimitive.Item.Props): ReactElement {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

/** The button that opens its item's content, named by its text, with a chevron that turns over while it is open. */
function NavigationMenuTrigger({
  className,
  children,
  ...props
}: NavigationMenuPrimitive.Trigger.Props): ReactElement {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(
        navigationMenuTriggerVariants(),
        "group [&_svg]:relative [&_svg]:top-px [&_svg]:ml-1 [&_svg]:size-3 [&_svg]:transition-transform data-popup-open:[&_svg]:rotate-180",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon />
    </NavigationMenuPrimitive.Trigger>
  );
}

/** What a trigger opens, shown in the popup. It slides a step in from the side of the item opened. */
function NavigationMenuContent({
  className,
  ...props
}: NavigationMenuPrimitive.Content.Props): ReactElement {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "h-full w-auto p-1 transition data-ending-style:opacity-0 data-starting-style:opacity-0 data-[activation-direction=left]:data-ending-style:translate-x-2 data-[activation-direction=left]:data-starting-style:-translate-x-2 data-[activation-direction=right]:data-ending-style:-translate-x-2 data-[activation-direction=right]:data-starting-style:translate-x-2 **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/** A link, in a menu's content or, with `variant="trigger"`, in the top-level list beside the triggers. `active`
 * marks the current page with `aria-current="page"`, and `render` makes it the router's link component. */
function NavigationMenuLink({
  className,
  variant = "default",
  ...props
}: NavigationMenuPrimitive.Link.Props &
  VariantProps<typeof navigationMenuLinkVariants>): ReactElement {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      data-variant={variant}
      className={cn(navigationMenuLinkVariants({ variant }), className)}
      {...props}
    />
  );
}

/** A small arrow below the item whose menu is open. */
function NavigationMenuIndicator({
  className,
  ...props
}: NavigationMenuPrimitive.Icon.Props): ReactElement {
  return (
    <NavigationMenuPrimitive.Icon
      data-slot="navigation-menu-indicator"
      className={cn(
        "absolute inset-x-0 top-full z-1 flex h-1.5 items-end justify-center overflow-hidden opacity-0 transition-opacity data-popup-open:opacity-100",
        className,
      )}
      {...props}
    >
      <span className="relative top-3/5 block size-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
    </NavigationMenuPrimitive.Icon>
  );
}

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuPositioner,
  NavigationMenuTrigger,
};
