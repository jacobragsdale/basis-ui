/* The number components' classes. They live apart from num.tsx because a component file exports only components; the
 * package never exports them. Money, Pct, Bps, Price32 and DateTime take Num's `align` and import these under their own
 * names, so `shadcn/no-restyle`'s errors list it for each. */

import { cva } from "#vendor/cva/cva.ts";

/** A number in tabular figures, so digits line up by place down a column, kept on one line. `align="end"` makes it a
 * block that aligns right, for a column of figures outside a table; in a `Table`, the cell's `numeric` variant aligns
 * it. */
const numVariants = cva("tabular-nums whitespace-nowrap", {
  variants: {
    align: {
      start: "",
      end: "block text-right",
    },
  },
  defaultVariants: {
    align: "start",
  },
});

export { numVariants };
