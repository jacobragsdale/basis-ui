/* The form fields for a choice: one of a few options on the browser's own select, and a flag on a checkbox, each
 * bound to a TanStack Form field as the others in form-fields.tsx are. */

import type { ReactElement } from "react";

import { Checkbox } from "./checkbox.tsx";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field.tsx";
import { useFieldParts } from "./form-field-parts.ts";
import type { FormFieldApi, FormFieldProps } from "./form-field-parts.ts";
import { NativeSelect, NativeSelectOption } from "./native-select.tsx";

/** The option that stands for no choice, shown while the field holds none of the options. */
function NoChoice<TValue extends string>({
  options,
  value,
  placeholder,
}: {
  readonly options: readonly { readonly value: TValue }[];
  readonly value: TValue;
  readonly placeholder: string;
}): ReactElement | null {
  return options.some((option) => option.value === value) ? null : (
    <NativeSelectOption value={value}>{placeholder}</NativeSelectOption>
  );
}

/** A choice of a few options, on the browser's own select, such as an enum a generated schema declares. A field that
 * starts with no choice holds `""`, which the placeholder stands for until an option is chosen.
 *
 * @use For a choice among a handful of options in a form on TanStack Form. For a long list, use Combobox.
 * @see NativeSelect, FormTextField
 *
 * @example
 * ```tsx
 * import { FormSelectField } from "@basis/ui";
 *
 * // In a page, the field is `form.Field`'s render argument.
 * const field = {
 *   handleBlur: () => undefined,
 *   handleChange: (_value: "buy" | "sell") => undefined,
 *   name: "side",
 *   state: { meta: { errors: [], isTouched: false }, value: "buy" as const },
 * };
 *
 * <FormSelectField
 *   field={field}
 *   label="Side"
 *   options={[
 *     { label: "Buy", value: "buy" },
 *     { label: "Sell", value: "sell" },
 *   ]}
 * />;
 * ```
 */
function FormSelectField<TValue extends string>({
  field,
  label,
  description,
  id,
  size,
  options,
  placeholder = "Choose…",
}: FormFieldProps & {
  /** The TanStack Form field, `form.Field`'s render argument. */
  readonly field: FormFieldApi<TValue>;
  /** The options, each its value and the words it shows. */
  readonly options: readonly { readonly value: TValue; readonly label: string }[];
  /** What the select shows while the field holds none of the options. */
  readonly placeholder?: string | undefined;
}): ReactElement {
  const parts = useFieldParts(field, id);
  return (
    <Field data-invalid={parts.invalid}>
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      <NativeSelect
        id={parts.id}
        size={size}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => {
          const picked = options.find((option) => option.value === event.currentTarget.value);
          if (picked !== undefined) {
            field.handleChange(picked.value);
          }
        }}
        aria-invalid={parts.invalid}
        aria-describedby={parts.describedBy}
      >
        <NoChoice options={options} value={field.state.value} placeholder={placeholder} />
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {description === undefined ? null : (
        <FieldDescription id={`${parts.id}-description`}>{description}</FieldDescription>
      )}
      <FieldError id={`${parts.id}-error`} errors={parts.errors} />
    </Field>
  );
}

/** A flag, ticked or not, its label beside the box.
 *
 * @use For a yes or no in a form on TanStack Form, such as "Send a confirmation". For a setting that takes effect at
 * once, use Switch.
 * @see Checkbox, FormTextField
 */
function FormCheckboxField({
  field,
  label,
  description,
  id,
}: Omit<FormFieldProps, "size"> & {
  /** The TanStack Form field, `form.Field`'s render argument. */
  readonly field: FormFieldApi<boolean>;
}): ReactElement {
  const parts = useFieldParts(field, id);
  return (
    <Field orientation="horizontal" data-invalid={parts.invalid}>
      <Checkbox
        id={parts.id}
        name={field.name}
        checked={field.state.value}
        onCheckedChange={(checked) => {
          field.handleChange(checked);
        }}
        onBlur={field.handleBlur}
        aria-invalid={parts.invalid}
        aria-describedby={parts.describedBy}
      />
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      {description === undefined ? null : (
        <FieldDescription id={`${parts.id}-description`}>{description}</FieldDescription>
      )}
      <FieldError id={`${parts.id}-error`} errors={parts.errors} />
    </Field>
  );
}

export { FormCheckboxField, FormSelectField };
