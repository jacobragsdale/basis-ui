/* Field's and FieldLegend's classes, from shadcn's Base UI source in its nova style. They live apart from field.tsx
 * because a component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** A field's layout: its label above its control (`vertical`), beside it (`horizontal`), or beside it once the field
 * group is wide enough (`responsive`). An invalid field, marked `data-invalid`, draws its label in the destructive
 * colour; its `FieldError` says why in words. */
const fieldVariants = cva("group/field flex w-full gap-2 data-[invalid=true]:text-destructive", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      horizontal:
        "flex-row items-center *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      responsive:
        "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

/** A fieldset's legend: a heading for the set (`legend`), or a label's size for a set of choices (`label`). */
const fieldLegendVariants = cva("mb-1.5 font-medium", {
  variants: {
    variant: {
      legend: "text-base",
      label: "text-sm",
    },
  },
  defaultVariants: {
    variant: "legend",
  },
});

export { fieldLegendVariants, fieldVariants };
