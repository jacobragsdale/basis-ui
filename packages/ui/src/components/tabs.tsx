/* Tabs and their parts, from Jacob's ui, which matches shadcn's Base UI source. Its `dark:` classes give way to
 * tokens that hold in both modes: an inactive trigger is `muted-foreground`, which the theme holds to 5.5:1, and the
 * active one sits on the background with a border, which reads as raised on the muted track in either mode. Its
 * arbitrary heights, ring width and underline offset are on the theme's scales, and a trigger keeps the 24 px target
 * in the compact density. Base UI moves between the triggers with the arrow keys. */

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "cn";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { tabsListVariants } from "./tabs-variants.ts";

/** A set of panels shown one at a time, horizontal by default. `defaultValue` or `value` names the open tab. */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props): ReactElement {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  );
}

/** The row of triggers, a tablist. `variant="line"` underlines the active trigger instead of raising it. */
function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>): ReactElement {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

/** A tab, named by its text, that opens the panel with the same `value`. */
function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props): ReactElement {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-target min-w-target flex-1 items-center justify-center gap-1.5 self-stretch rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-active:border-border data-active:bg-background data-active:text-foreground",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:border-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:-bottom-1.25 group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

/** The panel a trigger opens, a tabpanel named by its trigger. */
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props): ReactElement {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
