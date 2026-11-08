/* Skeleton, from shadcn's Base UI source: a muted block that stands in for content while it loads, with a `circle`
 * variant for round content such as an avatar. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { skeletonVariants } from "./skeleton-variants.ts";

/** A placeholder block. `className` gives it the size of what it stands for, such as `h-4 w-32`, or `size-8` with
 * `variant="circle"` for an avatar.
 *
 * @example
 * ```tsx
 * import { Skeleton } from "@basis/ui";
 *
 * <Skeleton className="h-4 w-32" />;
 * ```
 */
function Skeleton({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof skeletonVariants>): ReactElement {
  return (
    <div
      data-slot="skeleton"
      data-variant={variant}
      className={cn(skeletonVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Skeleton };
