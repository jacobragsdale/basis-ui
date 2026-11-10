/* The code `vp run new form` writes that is the same in every form: each kind of field's component, the types that
 * bind them to TanStack Form, and how a submit's failure lands on the fields or above the button. */

import type { FieldKind } from "./scaffold-fields.ts";

/** Each kind's field component, and what it needs from @basis/ui. */
const widgets: Readonly<
  Record<FieldKind, { readonly component: string; readonly ui: readonly string[] }>
> = {
  boolean: { component: "CheckField", ui: ["Checkbox"] },
  choice: { component: "ChoiceField", ui: ["NativeSelect", "NativeSelectOption"] },
  date: { component: "DateField", ui: ["AsOfDatePicker"] },
  instant: { component: "TextField", ui: ["FieldError", "Input"] },
  number: { component: "AmountField", ui: ["AmountInput", "amountSchema"] },
  text: { component: "TextField", ui: ["FieldError", "Input"] },
};

const describedLine = `      {description === undefined ? null : (
        <FieldDescription id={\`\${id}-description\`}>{description}</FieldDescription>
      )}`;

const fieldComponents: Readonly<Record<string, string>> = {
  AmountField: `/** An amount, which AmountInput reads, so \`1mm\` is 1,000,000; it draws its own error line. */
function AmountField({ id, label, description, field }: FieldProps<number | string | null>): ReactElement {
  const { value, meta } = field.state;
  const invalid = meta.isTouched && meta.errors.length > 0;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <AmountInput
        id={id}
        value={value}
        onValueChange={field.handleChange}
        onBlur={field.handleBlur}
        aria-invalid={invalid}
        aria-describedby={description === undefined ? undefined : \`\${id}-description\`}
        errors={invalid ? meta.errors : undefined}
      />
${describedLine}
    </Field>
  );
}`,
  CheckField: `/** A flag, ticked or not. */
function CheckField({ id, label, description, field }: FieldProps<boolean>): ReactElement {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={field.state.value}
        onCheckedChange={(checked) => {
          field.handleChange(checked);
        }}
        onBlur={field.handleBlur}
        aria-describedby={description === undefined ? undefined : \`\${id}-description\`}
      />
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
${describedLine}
    </Field>
  );
}`,
  ChoiceField: `/** One of the values the API's document lists. */
function ChoiceField<TValue extends string>({
  id,
  label,
  description,
  field,
  options,
}: FieldProps<TValue> & { readonly options: readonly TValue[] }): ReactElement {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => {
          const picked = options.find((option) => option === event.target.value);
          if (picked !== undefined) {
            field.handleChange(picked);
          }
        }}
        aria-describedby={description === undefined ? undefined : \`\${id}-description\`}
      >
        {options.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
${describedLine}
    </Field>
  );
}`,
  DateField: `/** A date, a business day, which AsOfDatePicker takes typed or picked; it draws its own error line. */
function DateField({ id, label, description, field }: FieldProps<string>): ReactElement {
  const { value, meta } = field.state;
  const invalid = meta.isTouched && meta.errors.length > 0;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <AsOfDatePicker
        id={id}
        max={null}
        value={value === "" ? null : Temporal.PlainDate.from(value)}
        onValueChange={(date) => {
          field.handleChange(date?.toString() ?? "");
        }}
        onBlur={field.handleBlur}
        aria-invalid={invalid}
        aria-describedby={description === undefined ? undefined : \`\${id}-description\`}
        errors={invalid ? meta.errors : undefined}
      />
${describedLine}
    </Field>
  );
}`,
  TextField: `/** Text, invalid once it has been touched and has an error. */
function TextField({ id, label, description, field }: FieldProps<string>): ReactElement {
  const { value, meta } = field.state;
  const invalid = meta.isTouched && meta.errors.length > 0;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        onBlur={field.handleBlur}
        onChange={(event) => {
          field.handleChange(event.target.value);
        }}
        aria-invalid={invalid}
        aria-describedby={description === undefined ? \`\${id}-error\` : \`\${id}-description \${id}-error\`}
      />
${describedLine}
      <FieldError id={\`\${id}-error\`} errors={invalid ? meta.errors : undefined} />
    </Field>
  );
}`,
};

const bindingTypes = `/** A field's errors, as TanStack Form holds them: the schema's issues and the API's details. */
type FieldErrors = NonNullable<ComponentProps<typeof FieldError>["errors"]>;

/** What a field component reads of TanStack Form's field: its value, errors and touch, and its handlers. */
interface FieldBinding<TValue> {
  readonly state: {
    readonly value: TValue;
    readonly meta: { readonly errors: FieldErrors; readonly isTouched: boolean };
  };
  readonly handleChange: (value: TValue) => void;
  readonly handleBlur: () => void;
}

interface FieldProps<TValue> {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly field: FieldBinding<TValue>;
}`;

const failureLines = `/** A 422's errors by the field of this form each names, or \`undefined\` when the fields cannot hold the failure: any
 * failure but a 422, a 422 that names no field, and one that names something this form has no field for. */
function errorsOnFields(error: unknown): Record<string, readonly string[]> | undefined {
  if (!isApiError(error) || error.status !== unprocessableContent) {
    return undefined;
  }
  const named = [...fieldErrors(error.problem)];
  return named.length > 0 && named.every(([name]) => fieldNames.has(name))
    ? Object.fromEntries(named)
    : undefined;
}

/** What \`send\` threw, or \`null\` once it succeeds. */
async function failureOf(send: () => Promise<unknown>): Promise<unknown> {
  try {
    await send();
    return null;
  } catch (error) {
    return error;
  }
}

/** What a submit leaves on the form: a 422's errors on the fields they name, or, for a failure the fields cannot
 * hold, a form error, which fails the submit while the ErrorAlert says what it was. */
function submitErrors(failure: unknown): string | { readonly fields: Record<string, readonly string[]> } {
  const fields = errorsOnFields(failure);
  return fields === undefined ? "It was not sent." : { fields };
}`;

export { bindingTypes, failureLines, fieldComponents, widgets };
