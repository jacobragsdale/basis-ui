/* Aspect Ratio, from shadcn's Base UI source: a box that keeps a width-to-height ratio, through the `--ratio`
 * variable that its `aspect-(--ratio)` class reads. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

interface AspectRatioProps extends ComponentProps<"div"> {
  /** Width over height, such as `16 / 9`. */
  readonly ratio: number;
}

/** A box whose height follows its width at `ratio`. Its content, such as an image, fills it with `size-full`.
 *
 * @use For an image or a video that keeps its shape as its width changes. A chart takes its parent's height instead, so
 * give that parent a height.
 * @see Card, Skeleton, Chart
 *
 * @example
 * ```tsx
 * import { AspectRatio } from "@basis/ui";
 *
 * <AspectRatio ratio={16 / 9}>
 *   <img src="/curve.png" alt="Treasury curve" />
 * </AspectRatio>;
 * ```
 */
function AspectRatio({ ratio, className, ...props }: AspectRatioProps): ReactElement {
  return (
    <div
      data-slot="aspect-ratio"
      style={{ "--ratio": ratio }}
      className={cn("relative aspect-(--ratio)", className)}
      {...props}
    />
  );
}

export { AspectRatio };
