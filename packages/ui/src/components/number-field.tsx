/* NumberField: Base UI's number field, a whole number or a decimal stepped by buttons, the arrow keys and the wheel
 * while focused, inside an input group's outline: a minus button, the input in tabular figures, and a plus button.
 * Base UI parses what is typed in the user's locale and clamps it to `min` and `max`; it formats with
 * `Intl.NumberFormatOptions` through `format`. */

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { cn } from "cn";
import type { ReactElement } from "react";

import { MinusIcon } from "#vendor/lucide/minus.tsx";
import { PlusIcon } from "#vendor/lucide/plus.tsx";

import { InputGroup, InputGroupButton } from "./input-group.tsx";
import { inputVariants } from "./input-variants.ts";

interface NumberFieldProps extends Omit<NumberFieldPrimitive.Root.Props, "className" | "render"> {
  /** The field's height: the select's default, or `sm` for a dense row. */
  readonly size?: "default" | "sm" | undefined;
  /** The input's id, which a `FieldLabel`'s `htmlFor` names. */
  readonly id?: string | undefined;
  /** The input's name for assistive technology, where no label names it. */
  readonly "aria-label"?: string | undefined;
  /** Marks the input invalid, as its field's validation finds it. */
  readonly "aria-invalid"?: boolean | undefined;
  /** The ids of the elements that describe the input, such as its field's description. */
  readonly "aria-describedby"?: string | undefined;
  /** The input's text while it is empty. */
  readonly placeholder?: string | undefined;
  /** Places the field, as with `w-40`; its look is fixed. */
  readonly className?: string | undefined;
}

/** A number field with buttons that step it down and up. Label it with a `FieldLabel` whose `htmlFor` is its `id`, or
 * with `aria-label`.
 *
 * @use For a small count or a setting stepped by a fixed amount, such as a number of days, a quantity of contracts or
 * a precision. For an amount, a price or a rate a user types, with `1.5m` and `25bp`, use AmountInput.
 * @see AmountInput, Input, Field, FieldLabel
 *
 * @example
 * ```tsx
 * import { Field, FieldLabel, NumberField } from "@basis/ui";
 *
 * <Field>
 *   <FieldLabel htmlFor="lookback">Look back, in days</FieldLabel>
 *   <NumberField id="lookback" defaultValue={30} min={1} max={365} />
 * </Field>;
 * ```
 */
function NumberField({
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": describedBy,
  placeholder,
  className,
  size,
  ...props
}: NumberFieldProps): ReactElement {
  return (
    // The root names its input with `id`, which its buttons' `aria-controls` point to.
    <NumberFieldPrimitive.Root
      data-slot="number-field"
      id={id}
      className={cn("min-w-0", className)}
      {...props}
    >
      <NumberFieldPrimitive.Group render={<InputGroup size={size} />}>
        <NumberFieldPrimitive.Decrement
          aria-label="Decrease"
          render={<InputGroupButton size="icon-xs" className="ml-(--control-xs-inset-icon)" />}
        >
          <MinusIcon />
        </NumberFieldPrimitive.Decrement>
        <NumberFieldPrimitive.Input
          data-slot="input-group-control"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={describedBy}
          placeholder={placeholder}
          className={cn(
            inputVariants(),
            "h-full flex-1 rounded-none border-0 bg-transparent text-center tabular-nums shadow-none ring-0 focus-visible:outline-none disabled:bg-transparent aria-invalid:ring-0",
          )}
        />
        <NumberFieldPrimitive.Increment
          aria-label="Increase"
          render={<InputGroupButton size="icon-xs" className="mr-(--control-xs-inset-icon)" />}
        >
          <PlusIcon />
        </NumberFieldPrimitive.Increment>
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  );
}

export { NumberField };
export type { NumberFieldProps };
