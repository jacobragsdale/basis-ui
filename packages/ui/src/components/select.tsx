/* Select and its parts, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): Base UI's select, a trigger that opens
 * a list of options, which the arrow keys move through and typing searches.
 *
 * Changed from shadcn: SelectTrigger's size is `selectTriggerVariants`, and the small size keeps the 24 px target; the
 * chevron takes its colour from the trigger, since `shadcn/no-restyle` keeps colours off an icon; the `dark:` classes
 * and the arbitrary radius are the theme's. shadcn's popup animates with tw-animate-css, which the theme lacks, so it
 * fades and scales through Base UI's `data-starting-style` and `data-ending-style` on a short transition, and still
 * opens without one when it sits over its trigger. */

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "cn";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";
import { CheckIcon } from "#vendor/lucide/check.tsx";
import { ChevronDownIcon } from "#vendor/lucide/chevron-down.tsx";
import { ChevronUpIcon } from "#vendor/lucide/chevron-up.tsx";

import { selectTriggerVariants } from "./select-variants.ts";

/** The gap between the trigger and the list, in pixels, as shadcn's. */
const popupOffset = 4;

/** A select: its trigger and its content, which holds the items. Give it `items` to show an item's label as the
 * value, and `value` with `onValueChange`, or `defaultValue`.
 *
 * @use For one choice from a list the page holds, short enough to scan. For a long list, use Combobox; for a search an
 * API answers, EntityPicker; for the browser's own control, NativeSelect.
 * @see Field, FieldLabel, Combobox, NativeSelect, EntityPicker
 *
 * @example
 * ```tsx
 * import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@basis/ui";
 *
 * const tenors = [
 *   { label: "2Y", value: "2y" },
 *   { label: "5Y", value: "5y" },
 *   { label: "10Y", value: "10y" },
 * ];
 *
 * <>
 *   <Label htmlFor="tenor">Tenor</Label>
 *   <Select items={tenors} defaultValue="5y">
 *     <SelectTrigger id="tenor">
 *       <SelectValue />
 *     </SelectTrigger>
 *     <SelectContent>
 *       {tenors.map((tenor) => (
 *         <SelectItem key={tenor.value} value={tenor.value}>
 *           {tenor.label}
 *         </SelectItem>
 *       ))}
 *     </SelectContent>
 *   </Select>
 * </>;
 * ```
 */
const Select = SelectPrimitive.Root;

/** Items under one SelectLabel. */
function SelectGroup({
  className,
  ...props
}: SelectPrimitive.Group.Props & { readonly className?: string }): ReactElement {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  );
}

/** The chosen item's label in the trigger, or its `placeholder` while nothing is chosen. */
function SelectValue({
  className,
  ...props
}: SelectPrimitive.Value.Props & { readonly className?: string }): ReactElement {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  );
}

/** The button that opens the select, holding its SelectValue and a chevron. Name it with a `Label` whose `htmlFor`
 * is its `id`, or `aria-label`. */
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props &
  VariantProps<typeof selectTriggerVariants> & { readonly className?: string }): ReactElement {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(selectTriggerVariants({ size }), className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="pointer-events-none size-4" />} />
    </SelectPrimitive.Trigger>
  );
}

/** The arrow at the top of a list too long for the screen, which scrolls it up while hovered. */
function SelectScrollUpButton({
  className,
  ...props
}: SelectPrimitive.ScrollUpArrow.Props & { readonly className?: string }): ReactElement {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-raised flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

/** The arrow at the bottom of a list too long for the screen, which scrolls it down while hovered. */
function SelectScrollDownButton({
  className,
  ...props
}: SelectPrimitive.ScrollDownArrow.Props & { readonly className?: string }): ReactElement {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-raised flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

/** The list that opens under the trigger, or over it with the chosen item aligned to it, the default. */
function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = popupOffset,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  > & { readonly className?: string }): ReactElement {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-popup"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "relative isolate z-popup max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-edge transition duration-popup data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-[align-trigger=true]:transition-none",
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

/** A heading for a SelectGroup's items. */
function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props & { readonly className?: string }): ReactElement {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

/** One option, with a check beside it while it is chosen. */
function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props & { readonly className?: string }): ReactElement {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-disabled [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

/** A line between groups of items. */
function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props & { readonly className?: string }): ReactElement {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
