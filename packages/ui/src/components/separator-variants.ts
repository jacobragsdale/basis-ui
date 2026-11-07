/* Separator's classes, from Jacob's ui, which matches shadcn's Base UI source, with shadcn's `data-horizontal` and
 * `data-vertical` variants, which come from its own stylesheet, matching Base UI's `data-orientation` instead. They
 * live apart from separator.tsx because SidebarSeparator draws on Base UI's separator with them in the sidebar's
 * colour, which a class on Separator could not set past `shadcn/no-restyle`; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Separator's look: a line in the theme's border colour, horizontal or vertical. It has no variant or size. */
const separatorVariants = cva(
  "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
);

export { separatorVariants };
