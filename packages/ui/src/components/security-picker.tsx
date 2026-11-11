/* SecurityPicker: an EntityPicker for securities named by their identifier. It reads the typed text as a CUSIP, an
 * ISIN or a SEDOL with `@basis/ui/securities`, by its length, and checks it, check digit and all, before it searches;
 * a text that is none of them is never sent, and the status line says why, such as `"91282CRF1" is not a CUSIP: its
 * check digit should be 0; look for a mistyped character.` The search receives the identifier with its kind, so it
 * can ask the API for the right one:
 *
 *   <SecurityPicker
 *     id="security"
 *     search={async (identifier, signal) => (await findSecurities({ [identifier.kind]: identifier.value }, { signal })).data}
 *     itemKey={(security) => security.cusip}
 *     itemLabel={(security) => security.description}
 *   />
 *
 * With `multiple`, a list of identifiers pasted into it, one per line or separated by spaces or commas, adds each
 * security found at once and says which identifiers found none (security-paste.ts). */

import type { ReactElement } from "react";

import { EntityPicker } from "./entity-picker.tsx";
import { MultipleSecurityPicker } from "./security-picker-multiple.tsx";
import { securityLookup } from "./security-picker-props.ts";
import type { SecurityPickerProps } from "./security-picker-props.ts";

/** A picker that searches for securities by CUSIP, ISIN or SEDOL. It waits for as many characters as the shortest
 * identifier it takes has, saying which it takes, then checks each text before searching.
 *
 * @use For choosing a security by its CUSIP, ISIN or SEDOL from an API's search. For any other entity, use
 * EntityPicker; to read an identifier without a search, parseSecurityIdentifier.
 * @see EntityPicker, parseSecurityIdentifier, SecurityIdentifier, Field, FieldLabel
 *
 * @example
 * ```tsx
 * import { Field, FieldLabel, SecurityPicker } from "@basis/ui";
 *
 * interface Security {
 *   readonly cusip: string;
 *   readonly description: string;
 * }
 *
 * <Field>
 *   <FieldLabel htmlFor="security">Security</FieldLabel>
 *   <SecurityPicker
 *     id="security"
 *     search={async () => Promise.resolve<readonly Security[]>([])}
 *     itemKey={(security) => security.cusip}
 *     itemLabel={(security) => security.description}
 *   />
 * </Field>;
 * ```
 */
function SecurityPicker<TItem>(props: SecurityPickerProps<TItem>): ReactElement {
  if (props.multiple === true) {
    return <MultipleSecurityPicker {...props} />;
  }
  const { search, kinds, ...rest } = props;
  const { defaults, lookup } = securityLookup({ kinds, search });
  return <EntityPicker {...defaults} {...rest} {...lookup} />;
}

export { SecurityPicker };
export type { SecurityPickerProps, SecuritySearch } from "./security-picker-props.ts";
