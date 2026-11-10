/* ButtonGroup's classes, from shadcn's Base UI source in its nova style. They live apart from button-group.tsx because
 * a component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** How a button group joins its children: in a row (`horizontal`) or a column (`vertical`), with the borders between
 * them merged and only the outer corners rounded. */
const buttonGroupVariants = cva(
  "flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-raised has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          "*:data-slot:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg! [&>[data-slot]~[data-slot]]:rounded-l-none [&>[data-slot]~[data-slot]]:border-l-0",
        vertical:
          "flex-col *:data-slot:rounded-b-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg! [&>[data-slot]~[data-slot]]:rounded-t-none [&>[data-slot]~[data-slot]]:border-t-0",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

export { buttonGroupVariants };
