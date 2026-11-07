/* Input's classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source) with its `dark:` classes removed. They live
 * apart from input.tsx because InputGroupInput draws as an Input without its outline, and a component file exports only
 * components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Input's look. It has no variant or size; InputGroupInput removes its outline, which the group draws instead. */
const inputVariants = cva(
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/30 md:text-sm",
);

export { inputVariants };
