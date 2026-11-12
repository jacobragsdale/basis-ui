/* The combobox's root: Base UI's, drawing at most 100 items unless its `limit` says otherwise, with the cap passed to
 * its content's notice (combobox-limit.ts). */

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import type { ReactElement } from "react";

import { ListLimit, listLimit } from "./combobox-limit.ts";

/** A combobox: an input and the list it filters. Give it `items`, and render each in ComboboxList's child function;
 * `multiple` chooses several, shown as ComboboxChips.
 *
 * @use For a list the page holds that is too long to scan. For a short list, use Select; for a search, EntityPicker.
 * @see Field, FieldLabel, Select, EntityPicker
 * @example
 * ```tsx
 * import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@basis/ui";
 *
 * const issuers = ["Treasury", "Fannie Mae", "Freddie Mac", "World Bank"];
 *
 * <Combobox items={issuers}>
 *   <ComboboxInput placeholder="Issuer" aria-label="Issuer" />
 *   <ComboboxContent>
 *     <ComboboxEmpty>No issuer matches.</ComboboxEmpty>
 *     <ComboboxList>
 *       {(issuer: string) => (
 *         <ComboboxItem key={issuer} value={issuer}>
 *           {issuer}
 *         </ComboboxItem>
 *       )}
 *     </ComboboxList>
 *   </ComboboxContent>
 * </Combobox>;
 * ```
 */
function Combobox<Value, Multiple extends boolean | undefined = false, Item = Value>({
  limit = listLimit,
  ...props
}: ComboboxPrimitive.Root.Props<Value, Multiple, Item>): ReactElement {
  return (
    <ListLimit value={limit}>
      <ComboboxPrimitive.Root<Value, Multiple, Item> limit={limit} {...props} />
    </ListLimit>
  );
}

export { Combobox };
