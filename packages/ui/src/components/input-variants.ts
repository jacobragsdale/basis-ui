/* Input's classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source) with its `dark:` classes removed. They live
 * apart from input.tsx because InputGroupInput draws as an Input without its outline, and a component file exports only
 * components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Input's look, at the select's two sizes; InputGroupInput removes its outline, which the group draws instead. */
const inputVariants = cva(
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-(--control-md-inset) py-1 text-base transition-colors outline-none file:inline-flex file:h-(--control-xs-height) file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-disabled disabled:opacity-disabled aria-invalid:border-destructive aria-invalid:outline-destructive md:text-sm",
  {
    variants: {
      size: {
        default: "h-(--control-md-height)",
        sm: "h-(--control-sm-height) min-h-target rounded-md",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export { inputVariants };
