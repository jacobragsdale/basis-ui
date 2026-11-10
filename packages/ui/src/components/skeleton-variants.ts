/* Skeleton's classes, from shadcn's Base UI source (its base-nova style). They live apart from skeleton.tsx because a
 * component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Skeleton's shape. shadcn draws a round placeholder, as for an avatar, with `className="rounded-full"`, which
 * `shadcn/no-restyle` rejects in an app, so the circle is a variant here. It holds still, where shadcn's pulses: a
 * page of skeletons that pulse, such as a loading table, sends a Citrix desktop's screen changes for as long as it
 * loads. */
const skeletonVariants = cva("bg-muted", {
  variants: {
    variant: {
      default: "rounded-md",
      circle: "rounded-full",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export { skeletonVariants };
