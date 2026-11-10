/* Button, from shadcn's Base UI source: Base UI's button, styled by `buttonVariants`. An app chooses its look through
 * `variant` and `size`, and `className` only places it, which `shadcn/no-restyle` enforces. */

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "cn";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { buttonVariants } from "./button-variants.ts";

/** A button. `render` swaps its element but keeps a button's role, so a link that should look like a button is a
 * `ButtonLink` instead.
 *
 * @use For an action on the page, such as submitting a form or opening a dialog. For a link to another page, use
 * ButtonLink; for something the user turns on and off, Toggle.
 * @see ButtonLink, ButtonGroup, Toggle, Spinner, Tooltip
 *
 * @example
 * ```tsx
 * import { Button } from "@basis/ui";
 *
 * <Button variant="outline" size="sm" onClick={() => undefined}>
 *   Export
 * </Button>;
 * ```
 */
function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>): ReactElement {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    />
  );
}

export { Button };
