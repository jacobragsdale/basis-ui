/* RadioGroup and RadioGroupItem, from shadcn's Base UI source in its nova style: Base UI's radio group, whose arrow keys
 * move the choice between its items.
 *
 * Changed from shadcn: each item is a 24 px target, `min-h-target` by `min-w-target`, with shadcn's 16 px circle drawn
 * inside it, as Checkbox is, so the target holds in the compact density; the circle takes the focus ring and the
 * invalid outline through `group-*` classes, and the `dark:` classes are gone. */

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { cn } from "cn";
import type { ReactElement } from "react";

/** A set of radio items, one of which is chosen. Name it with `aria-labelledby` pointing at its legend or label. */
function RadioGroup({
  className,
  ...props
}: RadioGroupPrimitive.Props & { readonly className?: string }): ReactElement {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  );
}

/** One choice in a RadioGroup, named by a `<label>` around it or a `Label` whose `htmlFor` is its `id`. */
function RadioGroupItem({
  className,
  ...props
}: RadioPrimitive.Root.Props & { readonly className?: string }): ReactElement {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "peer group/radio-group-item relative inline-flex size-4 min-h-target min-w-target shrink-0 items-center justify-center rounded-full outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        data-slot="radio-group-circle"
        className="relative flex aspect-square size-4 shrink-0 rounded-full border border-input transition-colors group-focus-visible/radio-group-item:border-ring group-focus-visible/radio-group-item:ring-3 group-focus-visible/radio-group-item:ring-ring/50 group-has-[:focus-visible]/field-label:ring-0 group-aria-invalid/radio-group-item:border-destructive group-aria-invalid/radio-group-item:ring-3 group-aria-invalid/radio-group-item:ring-destructive/30 group-data-checked/radio-group-item:border-primary group-data-checked/radio-group-item:bg-primary group-data-checked/radio-group-item:text-primary-foreground group-has-[:focus-visible]/field-label:group-data-unchecked/radio-group-item:border-input"
      >
        <RadioPrimitive.Indicator
          data-slot="radio-group-indicator"
          className="flex size-4 items-center justify-center"
        >
          <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
        </RadioPrimitive.Indicator>
      </span>
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
