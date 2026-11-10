/* Empty's classes, from shadcn's Base UI source (its base-nova style). They live apart from empty.tsx because a
 * component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Empty's look. shadcn draws its outlined empty state with `className="border border-dashed"`, which
 * `shadcn/no-restyle` rejects in an app, so the dashed border is the `outline` variant here. */
const emptyVariants = cva(
  "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance",
  {
    variants: {
      variant: {
        default: "",
        outline: "border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** EmptyMedia's look: an illustration as it is, or an icon on a small muted tile. */
const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export { emptyMediaVariants, emptyVariants };
