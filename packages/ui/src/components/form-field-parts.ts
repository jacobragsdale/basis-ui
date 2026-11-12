/* What the form fields share: the shape of a TanStack Form field they read, the props every one takes, and the ids
 * and state of a field's parts. */

import { useId } from "react";
import type { ComponentProps } from "react";

import type { FieldError } from "./field.tsx";

type FieldErrors = NonNullable<ComponentProps<typeof FieldError>["errors"]>;

/** What a field component reads of a TanStack Form field, `form.Field`'s render argument: its name, value, errors and
 * whether it has been touched, and its handlers. */
interface FormFieldApi<TValue> {
  readonly name: string;
  readonly state: {
    readonly value: TValue;
    readonly meta: { readonly errors: FieldErrors; readonly isTouched: boolean };
  };
  readonly handleChange: (value: TValue) => void;
  readonly handleBlur: () => void;
}

/** What every form field takes besides its field. */
interface FormFieldProps {
  /** The field's label. */
  readonly label: string;
  /** A line under the control that says what to enter, such as "Twelve capital letters and digits". */
  readonly description?: string | undefined;
  /** The control's id; one made from the field's name unless set. */
  readonly id?: string | undefined;
  /** The control's height: the select's default, or `sm` for a dense form. */
  readonly size?: "default" | "sm" | undefined;
}

/** The ids and state every form field shares: its control's id, its description's and error's, and whether it shows
 * as invalid, which it does once touched and in error. */
function useFieldParts<TValue>(
  field: FormFieldApi<TValue>,
  id: string | undefined,
): {
  readonly id: string;
  readonly describedBy: string;
  readonly invalid: boolean;
  readonly errors: FieldErrors | undefined;
} {
  const own = useId();
  const controlId = id ?? `${own}-${field.name}`;
  const { errors, isTouched } = field.state.meta;
  const invalid = isTouched && errors.length > 0;
  return {
    describedBy: `${controlId}-description ${controlId}-error`,
    errors: invalid ? errors : undefined,
    id: controlId,
    invalid,
  };
}

export { useFieldParts };
export type { FieldErrors, FormFieldApi, FormFieldProps };
