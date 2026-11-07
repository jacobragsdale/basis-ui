/* ToggleGroup and ToggleGroupItem, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): Base UI's toggle group, a
 * row or column of toggles of which one, or with `multiple` several, are pressed; the arrow keys move between them.
 *
 * Changed from shadcn: the gap between items is `--toggle-group-gap`, set from `spacing` in steps of the spacing scale
 * and read by `gap-(--toggle-group-gap)`, where shadcn used an arbitrary `gap-[--spacing(var(--gap))]`; `orientation`
 * reaches Base UI too, so the arrow keys follow a vertical group; shadcn's `data-horizontal` and `data-vertical`
 * variants, which the theme lacks, read `data-orientation`; and items outside a group keep their own variant and size.
 *
 * Both components take Toggle's `variant` and `size`, so they import Toggle's classes under their own names, which
 * `shadcn/no-restyle`'s errors then list. */

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cn } from "cn";
import { createContext, use, useMemo } from "react";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

// oxlint-disable-next-line typescript/consistent-type-imports -- `@shadcn/lint` reads no type-only import, and this value import is how its errors on ToggleGroup list Toggle's variants and sizes.
import {
  toggleVariants as toggleGroupItemVariants,
  toggleVariants as toggleGroupVariants,
} from "./toggle-variants.ts";

/** A group's direction, Base UI's: `horizontal` or `vertical`. */
type Orientation = NonNullable<ToggleGroupPrimitive.Props["orientation"]>;

interface ToggleGroupSettings extends VariantProps<typeof toggleGroupVariants> {
  readonly spacing: number;
  readonly orientation: Orientation;
}

/** What a group tells its items: their look, and whether they join (spacing 0) or stand apart. */
const ToggleGroupContext = createContext<ToggleGroupSettings>({
  orientation: "horizontal",
  spacing: 2,
});

/** A group of toggles in one look and size. `spacing` is the gap between them in steps of the spacing scale; at 0 they
 * join into one control. Name the group with `aria-label`. */
function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleGroupVariants> & {
    readonly className?: string;
    readonly spacing?: number;
    readonly orientation?: Orientation;
  }): ReactElement {
  const settings = useMemo(
    () => ({ orientation, size, spacing, variant }),
    [orientation, size, spacing, variant],
  );
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      orientation={orientation}
      style={{ "--toggle-group-gap": `calc(var(--spacing) * ${spacing})` }}
      className={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-(--toggle-group-gap) rounded-lg data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[size=sm]:rounded-md",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext value={settings}>{children}</ToggleGroupContext>
    </ToggleGroupPrimitive>
  );
}

/** One toggle in a ToggleGroup, in the group's variant and size when the group sets them. */
function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props &
  VariantProps<typeof toggleGroupItemVariants> & { readonly className?: string }): ReactElement {
  const context = use(ToggleGroupContext);
  const shownVariant = context.variant ?? variant;
  const shownSize = context.size ?? size;
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={shownVariant}
      data-size={shownSize}
      data-spacing={context.spacing}
      className={cn(
        "shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-[orientation=horizontal]/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-[orientation=vertical]/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleGroupItemVariants({ size: shownSize, variant: shownVariant }),
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
