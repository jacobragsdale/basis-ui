/* ComboboxChips and its parts, from shadcn's Base UI source in its nova style: a multiple combobox's chosen items as
 * chips inside Input's outline, each with a button that removes it, followed by the combobox's input. They sit apart
 * from combobox.tsx only to keep each file under `eslint/max-lines`.
 *
 * Changed from shadcn: the chip's remove button takes its offset and opacity from the chip, since `shadcn/no-restyle`
 * keeps them off a `@basis/ui` Button inside the package too; the chip's height is `h-5.25` where shadcn wrote
 * `h-[calc(--spacing(5.25))]`; the invalid ring is the theme's one destructive tint, in place of shadcn's two; and the
 * remove button, which shadcn left unnamed, is named "Remove" and the chip's text. */

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { cn } from "cn";
import type { ReactElement, Ref } from "react";

import { XIcon } from "#vendor/lucide/x.tsx";

import { Button } from "./button.tsx";

/** A multiple combobox's chosen items as chips, followed by its ComboboxChipsInput, in Input's outline. */
function ComboboxChips({
  className,
  ...props
}: ComboboxPrimitive.Chips.Props & {
  readonly className?: string;
  /** The ref `useComboboxAnchor` returns, which lines the popup up with the chips. */
  readonly ref?: Ref<HTMLDivElement>;
}): ReactElement {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent bg-clip-padding px-2.5 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/30 has-data-[slot=combobox-chip]:px-1",
        className,
      )}
      {...props}
    />
  );
}

/** One chosen item as a chip, with a button that removes it (`showRemove`, on by default), named "Remove" and the
 * chip's text when the chip is text. */
function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  readonly className?: string;
  readonly showRemove?: boolean;
}): ReactElement {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "flex h-5.25 w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-foreground has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0 *:data-[slot=combobox-chip-remove]:-ml-1 *:data-[slot=combobox-chip-remove]:opacity-50 *:data-[slot=combobox-chip-remove]:hover:opacity-100",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove ? (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          aria-label={typeof children === "string" ? `Remove ${children}` : "Remove"}
          data-slot="combobox-chip-remove"
        >
          <XIcon className="pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      ) : null}
    </ComboboxPrimitive.Chip>
  );
}

/** The input after a multiple combobox's chips. */
function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props & { readonly className?: string }): ReactElement {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn("min-w-16 flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { ComboboxChip, ComboboxChips, ComboboxChipsInput };
