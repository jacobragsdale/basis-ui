/* Textarea's classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source) with its `dark:` classes removed. They
 * live apart from textarea.tsx because InputGroupTextarea draws as a Textarea without its outline, and a component file
 * exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Textarea's look. It has no variant or size; InputGroupTextarea removes its outline, which the group draws instead. */
const textareaVariants = cva(
  "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/30 md:text-sm",
);

export { textareaVariants };
