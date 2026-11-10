/* Separator, from Jacob's ui, which matches shadcn's Base UI source: Base UI's separator, a line in the theme's
 * border colour, drawn by `separatorVariants`. */

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "cn";
import type { ReactElement } from "react";

import { separatorVariants } from "./separator-variants.ts";

/** A line between groups of content, horizontal by default. Screen readers announce it as a separator.
 *
 * @use For a line between groups of content, such as in a toolbar or a card. A menu takes its own separator part, such
 * as DropdownMenuSeparator, and a form FieldSeparator.
 * @see DropdownMenuSeparator, FieldSeparator, ButtonGroupSeparator
 *
 * @example
 * ```tsx
 * import { Separator } from "@basis/ui";
 *
 * <>
 *   <p>Rates</p>
 *   <Separator />
 *   <p>Credit</p>
 * </>;
 * ```
 */
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props): ReactElement {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(separatorVariants(), className)}
      {...props}
    />
  );
}

export { Separator };
