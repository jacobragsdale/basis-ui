/* The form fields for a choice: one of a few options on the browser's own select, and a flag on a checkbox, each
 * bound to a TanStack Form field as the others in form-fields.tsx are. */

import type { ReactElement } from "react";

import { Checkbox } from "./checkbox.tsx";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field.tsx";
import { emptyOf, holdText, useFieldParts } from "./form-field-parts.ts";
import type { Emptiness, FormFieldApi, FormFieldProps } from "./form-field-parts.ts";
import { NativeSelect, NativeSelectOption } from "./native-select.tsx";

/** The option that stands for no choice, `""` in the select: shown while the field holds none of the options, and
 * always for a field that may be left empty, so the choice can be taken back. */
function NoChoice({
  shown,
  placeholder,
}: {
  readonly shown: boolean;
  readonly placeholder: string;
}): ReactElement | null {
  return shown ? <NativeSelectOption value="">{placeholder}</NativeSelectOption> : null;
}

/** Gives the field the option picked, or, for a field that may be empty, what it holds while empty when the
 * placeholder is picked. */
function choose<TValue extends string | null | undefined>(
  {
    field,
    options,
    empty,
  }: {
    readonly field: FormFieldApi<TValue>;
    readonly options: readonly { readonly value: NonNullable<TValue> }[];
    readonly empty: "" | null | undefined;
  },
  picked: string,
): void {
  const option = options.find(({ value }) => value === picked);
  if (option !== undefined) {
    field.handleChange(option.value);
  } else if (empty !== "") {
    holdText(field, empty, "");
  }
}

/** FormSelectField's props, for a field whose value is `TValue`: an option's value, and `undefined` or `null` while
 * empty when it says `optional` or `nullable`. */
type FormSelectFieldProps<TValue extends string | null | undefined = string> = FormFieldProps &
  Emptiness<TValue> & {
    /** The TanStack Form field, `form.Field`'s render argument. */
    readonly field: FormFieldApi<TValue>;
    /** The options, each its value and the words it shows. */
    readonly options: readonly { readonly value: NonNullable<TValue>; readonly label: string }[];
    /** What the select shows while the field holds none of the options. */
    readonly placeholder?: string | undefined;
  };

/** A choice of a few options, on the browser's own select, such as an enum a generated schema declares. A field that
 * starts with no choice holds `""`, which the placeholder stands for until an option is chosen. A field the schema
 * lets be empty says so, `optional` or `nullable`: it holds `undefined` or `null` while empty, and its placeholder
 * stays in the list, so the choice can be taken back.
 *
 * @use For a choice among a handful of options in a form on TanStack Form. For a long list, use Combobox.
 * @see NativeSelect, FormTextField
 *
 * @example
 * ```tsx
 * import { FormSelectField } from "@basis/ui";
 * import type { FormFieldApi } from "@basis/ui";
 *
 * // In a page, the field is `form.Field`'s render argument, typed by the form's values.
 * const field: FormFieldApi<"buy" | "sell"> = {
 *   handleBlur: () => undefined,
 *   handleChange: () => undefined,
 *   name: "side",
 *   state: { meta: { errors: [], isTouched: false }, value: "buy" },
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
function FormSelectField<TValue extends string | null | undefined>({
  field,
  label,
  description,
  id,
  size,
  options,
  placeholder = "Choose…",
  ...emptiness
}: FormSelectFieldProps<TValue>): ReactElement {
  const parts = useFieldParts(field, id);
  const empty = emptyOf(emptiness);
  const chosen = options.some((option) => option.value === field.state.value);
  return (
    <Field data-invalid={parts.invalid}>
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      <NativeSelect
        id={parts.id}
        size={size}
        name={field.name}
        value={chosen ? (field.state.value ?? "") : ""}
        onBlur={field.handleBlur}
        onChange={(event) => {
          choose({ empty, field, options }, event.currentTarget.value);
        }}
        aria-invalid={parts.invalid}
        aria-describedby={parts.describedBy}
      >
        <NoChoice shown={!chosen || empty !== ""} placeholder={placeholder} />
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
export type { FormSelectFieldProps };
