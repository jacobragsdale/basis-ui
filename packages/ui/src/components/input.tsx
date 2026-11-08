/* Input, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): Base UI's input, which works inside a Base UI Field,
 * in shadcn's look. shadcn's `dark:` classes are gone: the input stays transparent on its surface in either mode. */

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { inputVariants } from "./input-variants.ts";

/** A text input. With `aria-invalid` its outline turns the destructive colour; a `FieldError` beside it says why.
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
function Input({ className, type, ...props }: ComponentProps<"input">): ReactElement {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants(), className)}
      {...props}
    />
  );
}

export { Input };
