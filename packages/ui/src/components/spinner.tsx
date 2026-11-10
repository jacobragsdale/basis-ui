/* Spinner, from shadcn's Base UI source: lucide's loader circle, turning, announced as "Loading". shadcn puts the
 * status role and the spin on the icon itself; here they sit on an `<output>` around it, whose implicit role is
 * `status`, because `shadcn/no-restyle` keeps motion classes off an icon, so the output turns the icon through
 * `[&>svg]:animate-spin`. The spin is a transform, which a CPU-drawn Citrix desktop handles cheaply, and it stops under
 * `prefers-reduced-motion`. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { LoaderCircleIcon } from "#vendor/lucide/loader-circle.tsx";

/** A loading indicator, an icon's size in the density, 16 px square in the comfortable density and 14 in the compact,
 * unless `className` sizes it, as with `size-6`. It is a status named "Loading";
 * give it an `aria-label` that says what is loading, such as "Loading positions", when the page shows more than one.
 *
 * @use For an action or a load under way whose length is unknown, such as a Button's while it submits. For content
 * still loading, use Skeleton; for a known share done, Progress.
 * @see Button, Skeleton, Progress, InputGroup
 *
 * @example
 * ```tsx
 * import { Spinner } from "@basis/ui";
 *
 * <Spinner />;
 * ```
 */
function Spinner({ className, ...props }: ComponentProps<"output">): ReactElement {
  return (
    <output
      data-slot="spinner"
      aria-label="Loading"
      className={cn(
        "inline-flex size-(--control-md-icon) shrink-0 [&>svg]:animate-spin motion-reduce:[&>svg]:animate-none",
        className,
      )}
      {...props}
    >
      <LoaderCircleIcon className="size-full" />
    </output>
  );
}

export { Spinner };
