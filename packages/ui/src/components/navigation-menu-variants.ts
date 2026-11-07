/* Navigation Menu's classes, from shadcn's Base UI source. shadcn exports the trigger's look as
 * `navigationMenuTriggerStyle()`, which an app puts on a top-level link; @basis/ui exports no class helpers, so the
 * look is NavigationMenuLink's `trigger` variant instead, and is written once here for both. They live apart from
 * navigation-menu.tsx because a component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** A top-level trigger's look, which a top-level link takes through `variant="trigger"`. */
const triggerLook =
  "group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-active:bg-muted/50 data-open:bg-muted/50 data-open:hover:bg-muted data-open:focus:bg-muted data-popup-open:bg-muted/50 data-popup-open:hover:bg-muted";

/** NavigationMenuTrigger's look. */
const navigationMenuTriggerVariants = cva(triggerLook);

/** NavigationMenuLink's look: `default` for a link in a menu's content, `trigger` for a link in the top-level list,
 * which then looks like the triggers beside it. */
const navigationMenuLinkVariants = cva("", {
  variants: {
    variant: {
      default:
        "flex items-center gap-2 rounded-lg p-2 text-sm transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 data-active:bg-muted/50 data-active:hover:bg-muted data-active:focus:bg-muted in-data-[slot=navigation-menu-content]:rounded-md [&_svg:not([class*='size-'])]:size-4",
      trigger: triggerLook,
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export { navigationMenuLinkVariants, navigationMenuTriggerVariants };
