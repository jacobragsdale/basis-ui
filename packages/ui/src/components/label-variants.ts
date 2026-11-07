/* Label's classes, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source). They live apart from label.tsx because
 * FieldLabel draws as a Label with a choice card's classes added, and a component file exports only components; the
 * package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Label's look. It has no variant or size; FieldLabel adds its own classes to these. */
const labelVariants = cva(
  "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-50",
);

export { labelVariants };
