/* Textarea's classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source) with its `dark:` classes removed. They
 * live apart from textarea.tsx because InputGroupTextarea draws as a Textarea without its outline, and a component file
 * exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Textarea's look. It has no variant or size; InputGroupTextarea removes its outline, which the group draws instead. */
const textareaVariants = cva(
  "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-(--control-md-inset) py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-disabled disabled:opacity-disabled aria-invalid:border-destructive aria-invalid:outline-destructive md:text-sm",
);

export { textareaVariants };
