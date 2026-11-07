/* The classes of Table's head and cell, from shadcn's Base UI source (its base-nova style), with a `numeric` variant
 * added, since most of the firm's tables are numbers. They live apart from table.tsx because a component file exports
 * only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** A column heading. `numeric` aligns it right, over the numbers of its column. */
const tableHeadVariants = cva(
  "h-10 px-2 align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
  {
    variants: {
      variant: {
        default: "text-left",
        numeric: "text-right",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** A cell. `numeric` aligns it right in tabular figures, so the digits of a column line up by place. */
const tableCellVariants = cva("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", {
  variants: {
    variant: {
      default: "",
      numeric: "text-right tabular-nums",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export { tableCellVariants, tableHeadVariants };
