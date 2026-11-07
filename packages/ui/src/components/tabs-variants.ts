/* TabsList's classes, from Jacob's ui, which matches shadcn's Base UI source, with its arbitrary padding on the
 * spacing scale and its `data-horizontal` and `data-vertical` variants matching Base UI's `data-orientation`. The
 * list's height is a minimum rather than shadcn's fixed `h-8`, so that the triggers' 24 px target fits inside it in
 * the compact density. They live apart from tabs.tsx because a component file exports only components; the package
 * never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** TabsList's look: `default` sets the triggers on a muted track, `line` underlines the active one. */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-0.75 text-muted-foreground group-data-[orientation=horizontal]/tabs:min-h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export { tabsListVariants };
