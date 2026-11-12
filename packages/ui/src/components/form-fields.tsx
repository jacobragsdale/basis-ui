/* The form's fields, bound to a TanStack Form field: a label, the control, a line that says what to enter, and the
 * field's errors, the schema's issues and the API's details, once it has been touched. A page that builds its form on
 * the schema orval generates passes each `form.Field`'s field to one of these, so no page writes the binding by hand.
 * They read the field as its API is shaped, so `@basis/ui` needs no form library of its own. */

import type { ReactElement } from "react";

import type { Suffixes } from "#format/parse.ts";

import { AmountInput } from "./amount-input.tsx";
import { AsOfDatePicker } from "./as-of-date-picker.tsx";
import { DatePicker } from "./date-picker.tsx";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field.tsx";
import { useFieldParts } from "./form-field-parts.ts";
import type { FormFieldApi, FormFieldProps } from "./form-field-parts.ts";
import { Input } from "./input.tsx";

/** A text field: one line of text, or a date the browser picks when `type="date"`.
 *
 * @use For a text field of a form on TanStack Form, such as an ISIN. For an amount, use FormAmountField; for a date,
 * FormDateField; for a choice, FormSelectField.
 * @see FormAmountField, FormDateField, FormSelectField, Field, fieldErrors
 *
 * @example
 * ```tsx
 * import { FormTextField } from "@basis/ui";
 *
 * // In a page, the field is `form.Field`'s render argument: `{(field) => <FormTextField field={field} ... />}`.
 * const field = {
 *   handleBlur: () => undefined,
 *   handleChange: (_value: string) => undefined,
 *   name: "security_id",
 *   state: { meta: { errors: [], isTouched: false }, value: "" },
 * };
 *
 * <FormTextField field={field} label="ISIN" description="Twelve capital letters and digits." />;
 * ```
 */
function FormTextField({
  field,
  label,
  description,
  id,
  size,
  type = "text",
  placeholder,
}: FormFieldProps & {
  /** The TanStack Form field, `form.Field`'s render argument. */
  readonly field: FormFieldApi<string>;
  /** The input's type: text unless set, an email address, or a date the browser's own picker takes. */
  readonly type?: "text" | "email" | "date" | undefined;
  /** An example of what to enter, such as "US91282CRF04". */
  readonly placeholder?: string | undefined;
}): ReactElement {
  const parts = useFieldParts(field, id);
  return (
    <Field data-invalid={parts.invalid}>
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      <Input
        id={parts.id}
        size={size}
        name={field.name}
        type={type}
        placeholder={placeholder}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => {
          field.handleChange(event.currentTarget.value);
        }}
        aria-invalid={parts.invalid}
        aria-describedby={parts.describedBy}
      />
      {description === undefined ? null : (
        <FieldDescription id={`${parts.id}-description`}>{description}</FieldDescription>
      )}
      <FieldError id={`${parts.id}-error`} errors={parts.errors} />
    </Field>
  );
}

/** An amount, read by AmountInput, so `1mm` is 1,000,000; its value is AmountInput's, which `amountSchema()` checks.
 *
 * @use For a face amount, a quantity or a price in a form on TanStack Form.
 * @see AmountInput, amountSchema, FormTextField
 */
function FormAmountField({
  field,
  label,
  description,
  id,
  size,
  suffixes,
  placeholder,
}: FormFieldProps & {
  /** The TanStack Form field, `form.Field`'s render argument. */
  readonly field: FormFieldApi<number | string | null>;
  /** The suffixes it reads; AmountInput's default unless set, `parSuffixes` for par. */
  readonly suffixes?: Suffixes | undefined;
  /** An example of what to enter, such as "5M". */
  readonly placeholder?: string | undefined;
}): ReactElement {
  const parts = useFieldParts(field, id);
  return (
    <Field data-invalid={parts.invalid}>
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      <AmountInput
        id={parts.id}
        size={size}
        name={field.name}
        value={field.state.value}
        suffixes={suffixes}
        placeholder={placeholder}
        onValueChange={field.handleChange}
        onBlur={field.handleBlur}
        aria-invalid={parts.invalid}
        aria-describedby={`${parts.id}-description`}
        errors={parts.errors}
      />
      {description === undefined ? null : (
        <FieldDescription id={`${parts.id}-description`}>{description}</FieldDescription>
      )}
    </Field>
  );
}

/** The ISO 8601 text a generated schema holds a date as, from a picker's date, and back. */
function dateOf(text: string): Temporal.PlainDate | null {
  try {
    return text === "" ? null : Temporal.PlainDate.from(text);
  } catch {
    return null;
  }
}

/** A date, held as the ISO 8601 text a generated schema declares, `""` while there is none: DatePicker's for any date,
 * or AsOfDatePicker's for the business day data is as of when `asOf`.
 *
 * @use For a settlement or maturity date in a form on TanStack Form.
 * @see DatePicker, AsOfDatePicker, FormTextField
 */
function FormDateField({
  field,
  label,
  description,
  id,
  size,
  asOf = false,
  min,
  max,
  today,
}: FormFieldProps & {
  /** The TanStack Form field, `form.Field`'s render argument. */
  readonly field: FormFieldApi<string>;
  /** Takes business days only, as AsOfDatePicker does, up to today unless `max` says otherwise. */
  readonly asOf?: boolean | undefined;
  /** The earliest date it takes; none unless set. */
  readonly min?: Temporal.PlainDate | undefined;
  /** The latest date it takes; none unless set, and today for an as-of date unless set, `null` for none. */
  readonly max?: Temporal.PlainDate | null | undefined;
  /** Today, which the picker counts from; today in New York unless set, as a test sets it. */
  readonly today?: Temporal.PlainDate | undefined;
}): ReactElement {
  const parts = useFieldParts(field, id);
  const Picker = asOf ? AsOfDatePicker : DatePicker;
  return (
    <Field data-invalid={parts.invalid}>
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      <Picker
        id={parts.id}
        size={size}
        name={field.name}
        value={dateOf(field.state.value)}
        min={min}
        max={max}
        today={today}
        onValueChange={(date) => {
          field.handleChange(date?.toString() ?? "");
        }}
        onBlur={field.handleBlur}
        aria-invalid={parts.invalid}
        aria-describedby={`${parts.id}-description`}
        errors={parts.errors}
      />
      {description === undefined ? null : (
        <FieldDescription id={`${parts.id}-description`}>{description}</FieldDescription>
      )}
    </Field>
  );
}

export { FormAmountField, FormDateField, FormTextField };
