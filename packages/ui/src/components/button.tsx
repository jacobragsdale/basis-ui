/* Button, from shadcn's Base UI source: Base UI's button, styled by `buttonVariants`. An app chooses its look through
 * `variant` and `size`, and `className` only places it, which `shadcn/no-restyle` enforces. */

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ReactElement } from "react";

import { buttonVariants } from "./button-variants.ts";

/** A button. `render` swaps its element but keeps a button's role, so a link that should look like a button is an
 * `<a>` with `buttonVariants` as its class instead. */
function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>): ReactElement {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
    />
  );
}

export { Button };
