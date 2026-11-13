/* What the form fields share: the shape of a TanStack Form field they read, the props every one takes, what an empty
 * field holds, and the ids and state of a field's parts. */

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

/** How a field says what it holds while empty, as its schema says: `""` for a required field unless it says
 * otherwise; `undefined` for an optional one, `optional`, so the form submits no such key; `null` for a nullable one,
 * `nullable`. The field's value type decides which it must say: a field whose value may be `null` says `nullable`,
 * one whose value may be `undefined` says `optional`, and either is refused where the value may be neither. */
type Emptiness<TValue> = null extends TValue
  ? { readonly nullable: true; readonly optional?: undefined }
  : undefined extends TValue
    ? { readonly optional: true; readonly nullable?: undefined }
    : { readonly optional?: undefined; readonly nullable?: undefined };

/** What an empty field holds, by what it says of itself. */
function emptyOf({
  optional,
  nullable,
}: {
  readonly optional?: true | undefined;
  readonly nullable?: true | undefined;
}): "" | null | undefined {
  if (nullable === true) {
    return null;
  }
  return optional === true ? undefined : "";
}

/** Gives the field the text typed, or what it holds while empty for no text. */
function holdText<TValue extends string | null | undefined>(
  field: FormFieldApi<TValue>,
  empty: "" | null | undefined,
  text: string,
): void {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `Emptiness` ties `optional` and `nullable` to what TValue admits, so `empty` is a value TValue takes, as the text of a text field is.
  field.handleChange((text === "" ? empty : text) as TValue);
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

export { emptyOf, holdText, useFieldParts };
export type { Emptiness, FieldErrors, FormFieldApi, FormFieldProps };
