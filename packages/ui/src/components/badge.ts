/* Badge, from shadcn's Base UI source: a short label for a status or a count, rendered by Base UI's `useRender` so
 * `render` can make it a link. */

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ReactElement } from "react";

import { badgeVariants } from "./badge-variants.ts";

/** A badge: a `<span>`, or the element `render` names, with `data-slot="badge"` and its variant as `data-variant`. */
function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>): ReactElement {
  const classes = cn(badgeVariants({ variant }), className);
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">({ className: classes }, props),
    render,
    state: { slot: "badge", variant },
  });
}

export { Badge };
