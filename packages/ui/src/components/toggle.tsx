/* Toggle, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): Base UI's toggle, a button that stays pressed until
 * pressed again, which Space and Enter press. */

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cn } from "cn";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { toggleVariants } from "./toggle-variants.ts";

/** A toggle button, with `aria-pressed` while it is on. An icon-only toggle takes an `aria-label`.
 *
 * @use For a button that turns one thing on or off where it stands, such as a filter in a toolbar. For a setting, use
 * Switch; for several toggles side by side, ToggleGroup.
 * @see ToggleGroup, Switch, Button, Tooltip
 *
 * @example
 * ```tsx
 * import { Toggle } from "@basis/ui";
 *
 * <Toggle variant="outline" aria-label="Show matured bonds">
 *   Matured
 * </Toggle>;
 * ```
 */
function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props &
  VariantProps<typeof toggleVariants> & { readonly className?: string }): ReactElement {
  return (
    <TogglePrimitive
      data-slot="toggle"
      data-variant={variant}
      data-size={size}
      className={cn(toggleVariants({ size, variant }), className)}
      {...props}
    />
  );
}

export { Toggle };
