/* Combobox and its parts, from shadcn's Base UI source in its nova style: Base UI's combobox, an input that filters a
 * list of items as the user types, with the arrow keys moving through the matches and Enter choosing one, or several
 * as chips with `multiple`.
 *
 * Changed from shadcn:
 * - ComboboxInput's group is Base UI's input group drawn as an InputGroup, so the popup lines up with the group's
 *   outline and spans its width, where shadcn anchored it to the input and widened it by an arbitrary
 *   `calc(var(--anchor-width) + --spacing(7))`.
 * - The list's height is on the spacing scale (`max-h-63`, shadcn's 252 px) inside a popup that is a column no taller
 *   than the screen allows, where shadcn computed it with an arbitrary `min()`; the list hides no scrollbar, since
 *   `no-scrollbar` is shadcn's own utility.
 * - The popup fades and scales through Base UI's `data-starting-style` and `data-ending-style`, since the theme has no
 *   tw-animate-css, and its translucent, blurred menu style is gone, since the theme removes blur.
 * - Icons take their colour from the element around them, and the chip's remove button its opacity from the chip,
 *   since `shadcn/no-restyle` keeps colours and opacity off a `@basis/ui` component inside the package too.
 * - The buttons shadcn left unnamed are named: ComboboxInput's trigger "Show options", and the clear button "Clear"
 *   unless an `aria-label` says otherwise.
 *
 * The chips are in combobox-chips.tsx and `useComboboxAnchor` in combobox-anchor.ts, which keeps each file under
 * `eslint/max-lines` and the hook out of a file of components.
 *
 * Added: the combobox draws at most 100 items unless its `limit` says otherwise, and its content says how many of the
 * matches it shows and to type to narrow them (combobox-limit.ts). */

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { cn } from "cn";
import type { ReactElement } from "react";

import { CheckIcon } from "#vendor/lucide/check.tsx";
import { ChevronDownIcon } from "#vendor/lucide/chevron-down.tsx";
import { XIcon } from "#vendor/lucide/x.tsx";

import { ComboboxLimitNotice } from "./combobox-limit-notice.tsx";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group.tsx";

/** The gap between the input and the popup, in pixels, as shadcn's. */
const popupOffset = 6;

/** The chosen value as text, or a render function of the chosen items. */
function ComboboxValue(props: ComboboxPrimitive.Value.Props): ReactElement {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

/** The button that opens the list, with a chevron after its content. Inside an input group it draws no background
 * while pressed. */
function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props & { readonly className?: string }): ReactElement {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "in-data-[slot=input-group]:data-pressed:bg-transparent [&_svg:not([class*='size-'])]:size-(--control-md-icon) [&>svg]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="pointer-events-none size-(--control-md-icon)" />
    </ComboboxPrimitive.Trigger>
  );
}

/** The button that clears the chosen value, named "Clear" unless an `aria-label` says otherwise. */
function ComboboxClear({
  className,
  ...props
}: ComboboxPrimitive.Clear.Props & { readonly className?: string }): ReactElement {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      aria-label="Clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={className}
      {...props}
    >
      <XIcon className="pointer-events-none" />
    </ComboboxPrimitive.Clear>
  );
}

/** The combobox's input inside an input group, with the button that opens the list (`showTrigger`, on by default) and
 * the one that clears it (`showClear`). Name it with a `Label` whose `htmlFor` is its `id`, or `aria-label`. */
function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  size,
  ...props
}: Omit<ComboboxPrimitive.Input.Props, "size"> & {
  readonly className?: string;
  /** The field's height: the select's default, or `sm` for a dense row. */
  readonly size?: "default" | "sm" | undefined;
  /** Whether the input ends in a button that opens the list; true by default. */
  readonly showTrigger?: boolean;
  /** Whether the input ends in a button that clears it; false by default. */
  readonly showClear?: boolean;
}): ReactElement {
  return (
    <ComboboxPrimitive.InputGroup
      render={<InputGroup className={cn("w-auto", className)} size={size} />}
    >
      <ComboboxPrimitive.Input render={<InputGroupInput disabled={disabled} />} {...props} />
      <InputGroupAddon align="inline-end">
        {showTrigger ? (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            render={<ComboboxTrigger />}
            aria-label="Show options"
            data-slot="input-group-button"
            className="group-has-data-[slot=combobox-clear]/input-group:hidden"
            disabled={disabled}
          />
        ) : null}
        {showClear ? <ComboboxClear disabled={disabled} /> : null}
      </InputGroupAddon>
      {children}
    </ComboboxPrimitive.InputGroup>
  );
}

/** The popup that holds the list, under the input by default. Pass `anchor` from `useComboboxAnchor` to line it up
 * with ComboboxChips. */
function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = popupOffset,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  > & { readonly className?: string }): ReactElement {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-popup"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          data-chips={anchor !== undefined && anchor !== null}
          className={cn(
            "group/combobox-content relative flex max-h-(--available-height) w-(--anchor-width) min-w-36 max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-edge transition duration-popup data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:shrink-0 *:data-[slot=input-group]:border-border *:data-[slot=input-group]:bg-muted *:data-[slot=input-group]:shadow-none",
            className,
          )}
          {...props}
        >
          {props.children}
          <ComboboxLimitNotice />
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

/** The list of matching items, which scrolls past 63 steps of the spacing scale. */
function ComboboxList({
  className,
  ...props
}: ComboboxPrimitive.List.Props & { readonly className?: string }): ReactElement {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-63 min-h-0 scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

/** One item, highlighted as the arrow keys reach it, with a check beside it while it is chosen. */
function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props & { readonly className?: string }): ReactElement {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-(--control-md-inset-icon) text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-disabled data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-(--control-md-icon) items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

/** Items under one ComboboxLabel. */
function ComboboxGroup(props: ComboboxPrimitive.Group.Props): ReactElement {
  return <ComboboxPrimitive.Group data-slot="combobox-group" {...props} />;
}

/** A heading for a ComboboxGroup's items. */
function ComboboxLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props & { readonly className?: string }): ReactElement {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

/** A group's items, rendered by a child function, as ComboboxList renders the root's. */
function ComboboxCollection(props: ComboboxPrimitive.Collection.Props): ReactElement {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

/** What the popup says while no item matches, such as "No matches". */
function ComboboxEmpty({
  className,
  ...props
}: ComboboxPrimitive.Empty.Props & { readonly className?: string }): ReactElement {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

/** A line between groups of items. */
function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props & { readonly className?: string }): ReactElement {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export { Combobox } from "./combobox-root.tsx";
export {
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
};
