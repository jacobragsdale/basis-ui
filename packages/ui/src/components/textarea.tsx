/* Textarea, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): a `<textarea>` that grows with its text, in Input's
 * look. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { textareaVariants } from "./textarea-variants.ts";

/** A multi-line text input, at least 16 steps of the spacing scale tall, growing with its content.
 *
 * @use For text of several lines, such as a trade's comment. For one line, use Input.
 * @see Field, FieldLabel, FieldError, Input, InputGroup
 *
 * @example
 * ```tsx
 * import { Field, FieldLabel, Textarea } from "@basis/ui";
 *
 * <Field>
 *   <FieldLabel htmlFor="note">Note</FieldLabel>
 *   <Textarea id="note" placeholder="Why the trade was amended" />
 * </Field>;
 * ```
 */
function Textarea({ className, ...props }: ComponentProps<"textarea">): ReactElement {
  return <textarea data-slot="textarea" className={cn(textareaVariants(), className)} {...props} />;
}

export { Textarea };
