/* SelectTrigger's classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source) with its `dark:` classes and
 * arbitrary radius replaced by the theme's tokens and scales. They live apart from select.tsx because a component file
 * exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** A select's trigger, at Input's height (`default`) or a step smaller (`sm`), which keeps the 24 px target in the
 * compact density. Its chevron, a direct child, is drawn in the muted colour. */
const selectTriggerVariants = cva(
  "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/30 data-placeholder:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>svg]:text-muted-foreground",
  {
    variants: {
      size: {
        default: "h-8",
        sm: "h-7 min-h-target min-w-target rounded-md",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export { selectTriggerVariants };
