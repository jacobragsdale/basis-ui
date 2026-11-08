/* Switch, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): Base UI's switch, a track whose thumb slides across
 * when it is on.
 *
 * Changed from shadcn: the switch is a target at least 24 px square, `min-h-target` by `min-w-target`, with the track
 * drawn inside it, as Checkbox is, so the target holds in the compact density. shadcn's track was sized in pixels (18.4
 * by 32, and 14 by 24 when small) with a 1 px transparent border, and its thumb travelled `100% - 2px`; here the track
 * is `h-4.5 w-8` (or `h-3.5 w-6`) with a quarter step of padding and the thumb travels `translate-x-3.5` (or `2.5`),
 * the same geometry on the spacing scale, so it follows the density. The border's focus and invalid colours are an
 * inset ring, and in the dark mode the thumb is the background's colour, as in the light mode. */

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";
import type { ReactElement } from "react";

/** A switch that turns a setting on or off at once. Name it with a `<label>` around it or a `Label` whose `htmlFor`
 * is its `id`. `size="sm"` draws a smaller track.
 *
 * @example
 * ```tsx
 * import { Field, FieldLabel, Switch } from "@basis/ui";
 *
 * <Field orientation="horizontal">
 *   <Switch id="live-prices" defaultChecked />
 *   <FieldLabel htmlFor="live-prices">Live prices</FieldLabel>
 * </Field>;
 * ```
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  readonly className?: string;
  readonly size?: "sm" | "default";
}): ReactElement {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex min-h-target min-w-target shrink-0 items-center justify-center rounded-full outline-none data-[size=default]:h-4.5 data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        data-slot="switch-track"
        className="inline-flex shrink-0 items-center rounded-full p-0.25 transition-all group-focus-visible/switch:ring-3 group-focus-visible/switch:ring-ring/50 group-focus-visible/switch:inset-ring group-focus-visible/switch:inset-ring-ring group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:inset-ring-0 group-aria-invalid/switch:ring-3 group-aria-invalid/switch:ring-destructive/30 group-aria-invalid/switch:inset-ring group-aria-invalid/switch:inset-ring-destructive group-data-checked/switch:bg-primary group-data-unchecked/switch:bg-input group-data-[size=default]/switch:h-4.5 group-data-[size=default]/switch:w-8 group-data-[size=sm]/switch:h-3.5 group-data-[size=sm]/switch:w-6"
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-unchecked:translate-x-0 group-data-[size=default]/switch:data-checked:translate-x-3.5 group-data-[size=sm]/switch:data-checked:translate-x-2.5"
        />
      </span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
