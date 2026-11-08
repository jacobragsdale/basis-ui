/* ButtonLink: a link drawn as a Button. Base UI's Button gives whatever it renders the button role, so a link that
 * should look like a button is this component, which stays a link. It takes Button's `variant` and `size`, and
 * `className` only places it, as on Button. It renders through Base UI's `useRender`, so `render` can make it the
 * router's link component, which renders an `<a>` of its own.
 *
 * Its classes are Button's, imported as `buttonLinkVariants`: `@shadcn/lint` finds a component's variants by its name
 * followed by `Variants`, so `shadcn/no-restyle`'s errors on ButtonLink list Button's variants and sizes. */

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { buttonVariants as buttonLinkVariants } from "./button-variants.ts";

/** A link that looks like a Button: an `<a>`, or the element `render` names, with `data-slot="button"` so that it
 * sits in a button group as a Button does, and its variant and size as `data-variant` and `data-size`.
 *
 * @example
 * ```tsx
 * import { ButtonLink } from "@basis/ui";
 *
 * <ButtonLink href="/trades" variant="outline">
 *   View trades
 * </ButtonLink>;
 * ```
 */
function ButtonLink({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"a"> & VariantProps<typeof buttonLinkVariants>): ReactElement {
  const classes = cn(buttonLinkVariants({ size, variant }), className);
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">({ className: classes }, props),
    render,
    state: { size, slot: "button", variant },
  });
}

export { ButtonLink };
