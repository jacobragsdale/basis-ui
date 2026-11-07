/* SidebarMenuButton's classes, from shadcn's Base UI source. The outline variant's arbitrary one-pixel shadows become
 * a ring in the sidebar's border colour, the focus ring names its colour on focus so the outline's ring cannot hide
 * it, and the small size keeps the 24 px target in the compact density. shadcn animates the button's width, height
 * and padding as the sidebar folds to its icon rail; here it folds at once, since animating size lays the page out
 * on every frame. They live apart from sidebar-menu.tsx because a component file exports only components; the
 * package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** SidebarMenuButton's look (`variant`) and height (`size`). On the icon rail every size is a square of `size-8`. */
const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background ring-1 ring-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:ring-sidebar-accent",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 min-h-target min-w-target text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export { sidebarMenuButtonVariants };
