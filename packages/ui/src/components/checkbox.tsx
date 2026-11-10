/* Checkbox, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): Base UI's checkbox, a box that fills with the
 * primary colour and a check when ticked.
 *
 * Changed from shadcn: the checkbox is a 24 px target, `min-h-target` by `min-w-target`, with shadcn's 16 px box drawn
 * inside it, so the target holds in the compact density, where the box is 12 px; shadcn widened the target with an
 * `::after` that the compact density shrinks below 24 px. An indeterminate checkbox draws a dash on the filled box,
 * where shadcn drew its check. The box takes the focus ring and the invalid outline through
 * `group-*` classes, and the `dark:` classes and the box's arbitrary radius are the theme's. */

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "cn";
import type { ReactElement } from "react";

import { CheckIcon } from "#vendor/lucide/check.tsx";
import { MinusIcon } from "#vendor/lucide/minus.tsx";

/** A checkbox. Name it with a `<label>` around it or a `Label` whose `htmlFor` is its `id`. `indeterminate`, for a
 * checkbox over others of which some are checked, fills the box and draws a dash in place of the check.
 *
 * @use For a choice a form submits, or for choosing items in a list. For a setting that takes effect at once, use
 * Switch; for one choice of a few, RadioGroup.
 * @see Field, FieldLabel, Label, Switch, RadioGroup
 *
 * @example
 * ```tsx
 * import { Checkbox, Field, FieldLabel } from "@basis/ui";
 *
 * <Field orientation="horizontal">
 *   <Checkbox id="include-matured" defaultChecked />
 *   <FieldLabel htmlFor="include-matured">Include matured bonds</FieldLabel>
 * </Field>;
 * ```
 */
function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.Root.Props & { readonly className?: string }): ReactElement {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer group/checkbox relative inline-flex size-4 min-h-target min-w-target shrink-0 items-center justify-center rounded-sm outline-none group-has-disabled/field:opacity-disabled data-disabled:cursor-not-allowed data-disabled:opacity-disabled",
        className,
      )}
      {...props}
    >
      <span
        data-slot="checkbox-box"
        className="flex size-4 items-center justify-center rounded-sm border border-input transition-colors group-focus-visible/checkbox:border-ring group-focus-visible/checkbox:outline-solid group-focus-visible/checkbox:outline group-focus-visible/checkbox:outline-offset-(--focus-offset) group-focus-visible/checkbox:outline-ring group-has-[:focus-visible]/field-label:outline-none group-aria-invalid/checkbox:border-destructive group-aria-invalid/checkbox:outline-destructive group-data-checked/checkbox:border-primary group-data-checked/checkbox:bg-primary group-data-checked/checkbox:text-primary-foreground group-data-indeterminate/checkbox:border-primary group-data-indeterminate/checkbox:bg-primary group-data-indeterminate/checkbox:text-primary-foreground group-has-[:focus-visible]/field-label:group-data-unchecked/checkbox:border-input"
      >
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
        >
          <CheckIcon className="group-data-indeterminate/checkbox:hidden" />
          <MinusIcon className="hidden group-data-indeterminate/checkbox:block" />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
