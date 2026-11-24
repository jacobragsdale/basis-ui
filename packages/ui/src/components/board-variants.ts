/* The board's card: a surface on its cell, an edge, and the selection's fill when chosen. No shadow and no motion,
 * since a board of hundreds of cards is drawn on the CPU on the firm's desktops. */

import { cva } from "#vendor/cva/cva.ts";

const boardCardVariants = cva(
  "content-auto flex min-w-0 items-start gap-1 rounded-md border border-edge bg-card p-2 text-sm text-card-foreground data-dragging:opacity-disabled",
  {
    defaultVariants: { selected: false },
    variants: {
      selected: {
        false: "",
        true: "border-ring bg-selection",
      },
    },
  },
);

export { boardCardVariants };
