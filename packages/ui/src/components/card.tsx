/* Card and its parts, from shadcn's Base UI source. shadcn spaces a card through a `--card-spacing` property set by
 * an arbitrary class; here each part takes the spacing scale's step for the card's size, 4 by default and 3 when
 * small, so no class leaves the theme's scales. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

/** A card: a raised panel on the `card` surface. `size="sm"` tightens its spacing.
 *
 * @example
 * ```tsx
 * import { Card, CardContent, CardDescription, CardHeader, CardTitle, Money } from "@basis/ui";
 *
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Market value</CardTitle>
 *     <CardDescription>At yesterday's close</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     <Money value={1_234_567.89} />
 *   </CardContent>
 * </Card>;
 * ```
 */
function Card({
  className,
  size = "default",
  ...props
}: ComponentProps<"div"> & { readonly size?: "default" | "sm" }): ReactElement {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-edge has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className,
      )}
      {...props}
    />
  );
}

/** The card's title, description and action. With an action, the action takes a column of its own at the end. */
function CardHeader({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min grid-cols-1 items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className,
      )}
      {...props}
    />
  );
}

/** The card's title. */
function CardTitle({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

/** A line under the card's title saying what the card shows. */
function CardDescription({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** A control at the header's end, such as a menu button, beside the title and description. */
function CardAction({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

/** The card's body. */
function CardContent({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  );
}

/** The card's last row, for its actions or a note. */
function CardFooter({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted p-4 group-data-[size=sm]/card:p-3",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
