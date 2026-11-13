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
import { emptyOf, holdText, useFieldParts } from "./form-field-parts.ts";
import type { Emptiness, FormFieldApi, FormFieldProps } from "./form-field-parts.ts";
import { Input } from "./input.tsx";

/** The line under a field's control that says what to enter, when it has one. */
function DescriptionLine({
  id,
  description,
}: {
  readonly id: string;
  readonly description: string | undefined;
}): ReactElement | null {
  return description === undefined ? null : (
    <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
  );
}

/** FormTextField's props, for a field whose value is `TValue`: text, and `undefined` or `null` while empty when it
 * says `optional` or `nullable`. */
type FormTextFieldProps<TValue extends string | null | undefined = string> = FormFieldProps &
  Emptiness<TValue> & {
    /** The TanStack Form field, `form.Field`'s render argument: text, `""` while empty unless it is `optional` or
     * `nullable`. */
    readonly field: FormFieldApi<TValue>;
    /** The input's type: text unless set, an email address, or a date the browser's own picker takes. */
    readonly type?: "text" | "email" | "date" | undefined;
    /** An example of what to enter, such as "US91282CRF04". */
    readonly placeholder?: string | undefined;
  };

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
function FormTextField<TValue extends string | null | undefined = string>({
  field,
  label,
  description,
  id,
  size,
  type = "text",
  placeholder,
  ...emptiness
}: FormTextFieldProps<TValue>): ReactElement {
  const parts = useFieldParts(field, id);
  const empty = emptyOf(emptiness);
  return (
    <Field data-invalid={parts.invalid}>
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      <Input
        id={parts.id}
        size={size}
        name={field.name}
        type={type}
        placeholder={placeholder}
        value={field.state.value ?? ""}
        onBlur={field.handleBlur}
        onChange={(event) => {
          holdText(field, empty, event.currentTarget.value);
        }}
        aria-invalid={parts.invalid}
        aria-describedby={parts.describedBy}
      />
      <DescriptionLine id={parts.id} description={description} />
      <FieldError id={`${parts.id}-error`} errors={parts.errors} />
    </Field>
  );
}

/** FormAmountField's props, for a field whose value is `TValue`: AmountInput's value, and `undefined` while empty
 * when it says `optional`. */
type FormAmountFieldProps<
  TValue extends number | string | null | undefined = number | string | null,
> = FormFieldProps & {
  /** The TanStack Form field, `form.Field`'s render argument: AmountInput's value, `null` while empty, which
   * `amountSchema()` refuses and `.nullable()` takes, or `undefined` while empty when it is `optional`. */
  readonly field: FormFieldApi<TValue>;
  /** The suffixes it reads; AmountInput's default unless set, `parSuffixes` for par. */
  readonly suffixes?: Suffixes | undefined;
  /** An example of what to enter, such as "5M". */
  readonly placeholder?: string | undefined;
} & (undefined extends TValue
    ? {
        /** Holds `undefined` while empty, so the form submits no such key, as `amountSchema().optional()` takes. */
        readonly optional: true;
      }
    : { readonly optional?: undefined });

/** An amount, read by AmountInput, so `1mm` is 1,000,000; its value is AmountInput's, which `amountSchema()` checks.
 *
 * @use For a face amount, a quantity or a price in a form on TanStack Form.
 * @see AmountInput, amountSchema, FormTextField
 */
function FormAmountField<
  TValue extends number | string | null | undefined = number | string | null,
>({
  field,
  label,
  description,
  id,
  size,
  suffixes,
  placeholder,
  optional,
}: FormAmountFieldProps<TValue>): ReactElement {
  const parts = useFieldParts(field, id);
  return (
    <Field data-invalid={parts.invalid}>
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      <AmountInput
        id={parts.id}
        size={size}
        name={field.name}
        value={field.state.value ?? null}
        suffixes={suffixes}
        placeholder={placeholder}
        onValueChange={(value) => {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- AmountInput's value is a number, text or `null`, which TValue takes, and `optional` is required where TValue takes `undefined`.
          field.handleChange((value === null && optional === true ? undefined : value) as TValue);
        }}
        onBlur={field.handleBlur}
        aria-invalid={parts.invalid}
        aria-describedby={`${parts.id}-description`}
        errors={parts.errors}
      />
      <DescriptionLine id={parts.id} description={description} />
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

/** FormDateField's props, for a field whose value is `TValue`: ISO 8601 text, and `undefined` or `null` while
 * empty when it says `optional` or `nullable`. */
type FormDateFieldProps<TValue extends string | null | undefined = string> = FormFieldProps &
  Emptiness<TValue> & {
    /** The TanStack Form field, `form.Field`'s render argument. */
    readonly field: FormFieldApi<TValue>;
    /** Takes business days only, as AsOfDatePicker does, up to today unless `max` says otherwise. */
    readonly asOf?: boolean | undefined;
    /** The earliest date it takes; none unless set. */
    readonly min?: Temporal.PlainDate | undefined;
    /** The latest date it takes; none unless set, and today for an as-of date unless set, `null` for none. */
    readonly max?: Temporal.PlainDate | null | undefined;
    /** Today, which the picker counts from; today in New York unless set, as a test sets it. */
    readonly today?: Temporal.PlainDate | undefined;
  };

/** A date, held as the ISO 8601 text a generated schema declares, `""` while there is none unless it is `optional`
 * or `nullable`: DatePicker's for any date, or AsOfDatePicker's for the business day data is as of when `asOf`.
 *
 * @use For a settlement or maturity date in a form on TanStack Form.
 * @see DatePicker, AsOfDatePicker, FormTextField
 */
function FormDateField<TValue extends string | null | undefined = string>({
  field,
  label,
  description,
  id,
  size,
  asOf = false,
  min,
  max,
  today,
  ...emptiness
}: FormDateFieldProps<TValue>): ReactElement {
  const parts = useFieldParts(field, id);
  const Picker = asOf ? AsOfDatePicker : DatePicker;
  return (
    <Field data-invalid={parts.invalid}>
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      <Picker
        id={parts.id}
        size={size}
        name={field.name}
        value={dateOf(field.state.value ?? "")}
        min={min}
        max={max}
        today={today}
        onValueChange={(date) => {
          holdText(field, emptyOf(emptiness), date?.toString() ?? "");
        }}
        onBlur={field.handleBlur}
        aria-invalid={parts.invalid}
        aria-describedby={`${parts.id}-description`}
        errors={parts.errors}
      />
      <DescriptionLine id={parts.id} description={description} />
    </Field>
  );
}

export { FormAmountField, FormDateField, FormTextField };
export type { FormAmountFieldProps, FormDateFieldProps, FormTextFieldProps };
