/* Input, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): Base UI's input, which works inside a Base UI Field,
 * in shadcn's look. shadcn's `dark:` classes are gone: the input stays transparent on its surface in either mode. */

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import { inputVariants } from "./input-variants.ts";

/** A text input, at the select's two sizes: `size="sm"` for a dense row. With `aria-invalid` its outline turns the
 * destructive colour; a `FieldError` beside it says why.
 *
 * @use For a line of text, such as a name or a CUSIP. For an amount or a rate, use AmountInput; for a date,
 * AsOfDatePicker; for several lines, Textarea; for a search an API answers, EntityPicker.
 * @see Field, FieldLabel, FieldError, InputGroup, AmountInput, Textarea
 *
 * @example
 * ```tsx
 * import { Field, FieldLabel, Input } from "@basis/ui";
 *
 * <Field>
 *   <FieldLabel htmlFor="book">Book</FieldLabel>
 *   <Input id="book" placeholder="Rates" />
 * </Field>;
 * ```
 */
function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>): ReactElement {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  );
}

export { Input };
