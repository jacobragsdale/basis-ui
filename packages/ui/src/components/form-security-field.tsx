/* A security chosen in a form: SecurityPicker bound to a TanStack Form field, as the other form fields bind their
 * controls, holding the identifier a generated schema declares, such as the CUSIP, rather than the item the search
 * found. */

import type { ReactElement, ReactNode } from "react";

import { Field, FieldDescription, FieldError, FieldLabel } from "./field.tsx";
import { emptyOf, holdText, useFieldParts } from "./form-field-parts.ts";
import type { Emptiness, FormFieldApi, FormFieldProps } from "./form-field-parts.ts";
import { useHeldSecurity } from "./form-security-held.ts";
import type { SecuritySearch } from "./security-picker-props.ts";
import { SecurityPicker } from "./security-picker.tsx";
import type { SecurityIdentifierKind } from "#securities/security-identifier.ts";

/** FormSecurityField's props, for a field whose value is `TValue`: an identifier, and `undefined` or `null` while
 * empty when it says `optional` or `nullable`. */
type FormSecurityFieldProps<
  TItem,
  TValue extends string | null | undefined = string,
> = FormFieldProps & Emptiness<TValue> & SecurityFieldProps<TItem, TValue>;

interface SecurityFieldProps<TItem, TValue extends string | null | undefined> {
  /** The TanStack Form field, `form.Field`'s render argument, holding the chosen security's identifier, `""` while
   * none is chosen unless it is `optional` or `nullable`. */
  readonly field: FormFieldApi<TValue>;
  /** Finds the securities the checked identifier names. */
  readonly search: SecuritySearch<TItem>;
  /** An item's stable id. */
  readonly itemKey: (item: TItem) => string;
  /** An item as text, in the input once chosen and in the list. */
  readonly itemLabel: (item: TItem) => string;
  /** What the field holds for a chosen item, such as its CUSIP; `itemKey` unless set. */
  readonly itemValue?: ((item: TItem) => string) | undefined;
  /** What a result shows in the list; its label unless set. */
  readonly renderItem?: ((item: TItem) => ReactNode) | undefined;
  /** The identifiers it takes; a CUSIP, an ISIN or a SEDOL unless set. */
  readonly kinds?: readonly SecurityIdentifierKind[] | undefined;
}

/** A security found by its CUSIP, ISIN or SEDOL, held as the identifier `itemValue` gives, `""` while none is chosen
 * unless it is `optional` or `nullable`. The picker shows the form's value: an edit form opened on an identifier finds
 * its security through `search`, and `form.reset()` empties it.
 *
 * @use For the security of a trade or an order in a form on TanStack Form. Outside a form, use SecurityPicker.
 * @see SecurityPicker, FormTextField, FormAmountField
 *
 * @example
 * ```tsx
 * import { FormSecurityField } from "@basis/ui";
 *
 * interface Security {
 *   readonly cusip: string;
 *   readonly description: string;
 * }
 *
 * // In a page, the field is `form.Field`'s render argument.
 * const field = {
 *   handleBlur: () => undefined,
 *   handleChange: (_value: string) => undefined,
 *   name: "cusip",
 *   state: { meta: { errors: [], isTouched: false }, value: "" },
 * };
 *
 * <FormSecurityField
 *   field={field}
 *   label="Bond"
 *   search={async () => Promise.resolve<readonly Security[]>([])}
 *   itemKey={(security) => security.cusip}
 *   itemLabel={(security) => security.description}
 * />;
 * ```
 */
function FormSecurityField<TItem, TValue extends string | null | undefined = string>({
  field,
  label,
  description,
  id,
  size,
  search,
  itemKey,
  itemLabel,
  itemValue = itemKey,
  renderItem,
  kinds,
  ...emptiness
}: FormSecurityFieldProps<TItem, TValue>): ReactElement {
  const parts = useFieldParts(field, id);
  const held = useHeldSecurity({ itemValue, kinds, search, value: field.state.value });
  return (
    <Field data-invalid={parts.invalid}>
      <FieldLabel htmlFor={parts.id}>{label}</FieldLabel>
      <SecurityPicker
        id={parts.id}
        size={size}
        search={search}
        itemKey={itemKey}
        itemLabel={itemLabel}
        {...(renderItem === undefined ? {} : { renderItem })}
        {...(kinds === undefined ? {} : { kinds })}
        value={held.item}
        onValueChange={(item) => {
          held.choose(item);
          holdText(field, emptyOf(emptiness), item === null ? "" : itemValue(item));
          field.handleBlur();
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

export { FormSecurityField };
export type { FormSecurityFieldProps };
