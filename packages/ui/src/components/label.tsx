/* Label, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): a `<label>` for a control, dimmed when its control or
 * field is disabled. Base UI's checkbox, radio and switch mark themselves disabled with `data-disabled`, which
 * `peer-disabled` cannot see, so the label reads that too. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { labelVariants } from "./label-variants.ts";

/** A label. Point `htmlFor` at the control's `id`, or wrap the control in it.
 *
 * @use For naming a control outside a Field, such as a Checkbox or a Switch beside its text. Inside a Field, use
 * FieldLabel.
 * @see FieldLabel, Checkbox, Switch, RadioGroup, NativeSelect
 *
 * @example
 * ```tsx
 * import { Input, Label } from "@basis/ui";
 *
 * <>
 *   <Label htmlFor="desk">Desk</Label>
 *   <Input id="desk" />
 * </>;
 * ```
 */
function Label({ className, ...props }: ComponentProps<"label">): ReactElement {
  return (
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- the caller associates it, through `htmlFor` or the control it wraps, both in `props`.
    <label data-slot="label" className={cn(labelVariants(), className)} {...props} />
  );
}

export { Label };
