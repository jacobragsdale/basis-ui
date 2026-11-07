/* Skeleton's classes, from shadcn's Base UI source (its base-nova style). They live apart from skeleton.tsx because a
 * component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Skeleton's shape. shadcn draws a round placeholder, as for an avatar, with `className="rounded-full"`, which
 * `shadcn/no-restyle` rejects in an app, so the circle is a variant here. It pulses through opacity alone, which a
 * CPU-drawn Citrix desktop repaints cheaply, and holds still under `prefers-reduced-motion`. */
const skeletonVariants = cva("animate-pulse bg-muted motion-reduce:animate-none", {
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
