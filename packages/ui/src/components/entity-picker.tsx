/* EntityPicker: a combobox that finds what it offers by searching, through a function the app passes, normally a
 * generated client's function for a search route:
 *
 *   <EntityPicker
 *     id="issuer"
 *     search={async (text, signal) => (await searchIssuers({ q: text }, { signal })).data}
 *     itemKey={(issuer) => issuer.id}
 *     itemLabel={(issuer) => issuer.name}
 *   />
 *
 * It searches once typing stops for `debounceMs`, aborts a search that a newer text replaced, and shows only the last
 * text's results; entity-search.ts holds that search, on the app's query client. The popup's status line says what
 * the picker is doing: waiting for text, searching, why the text cannot be searched, the error, or that nothing
 * matched, in words that a screen reader hears politely. The arrow keys move through the results and Enter chooses
 * one; with `multiple`, the choices are chips, each with a button that removes it.
 *
 * It is Base UI's combobox with its own filter off, since the search has filtered already, on Combobox's parts. */

import { cn } from "cn";
import type { ReactElement } from "react";

import { Combobox, ComboboxInput, ComboboxValue } from "./combobox.tsx";
import { useComboboxAnchor } from "./combobox-anchor.ts";
import { ComboboxChip, ComboboxChips, ComboboxChipsInput } from "./combobox-chips.tsx";
import { PickerContent } from "./entity-picker-content.tsx";
import { inputProps, usePickerSearch } from "./entity-picker-props.ts";
import type {
  EntityPickerProps,
  MultipleEntityPickerProps,
  SingleEntityPickerProps,
} from "./entity-picker-props.ts";

/** The picker that chooses one item. */
function SingleEntityPicker<TItem>({
  className,
  ...props
}: SingleEntityPickerProps<TItem>): ReactElement {
  const { itemKey, itemLabel } = props;
  const search = usePickerSearch(props);
  return (
    <div data-slot="entity-picker" className={cn("min-w-0", className)}>
      <Combobox
        items={search.items}
        filter={null}
        itemToStringLabel={itemLabel}
        isItemEqualToValue={(item, chosen) => itemKey(item) === itemKey(chosen)}
        value={props.value}
        defaultValue={props.defaultValue}
        onValueChange={(value) => {
          props.onValueChange?.(value);
        }}
        onInputValueChange={search.handleInputValueChange}
        disabled={props.disabled ?? false}
      >
        <ComboboxInput
          {...inputProps(props, search.state)}
          disabled={props.disabled ?? false}
          showTrigger={false}
          showClear
        />
        <PickerContent
          state={search.state}
          hint={search.hint}
          itemKey={itemKey}
          itemLabel={itemLabel}
          renderItem={props.renderItem}
        />
      </Combobox>
    </div>
  );
}

/** The picker that chooses several items, as chips. */
function MultipleEntityPicker<TItem>({
  className,
  ...props
}: MultipleEntityPickerProps<TItem>): ReactElement {
  const { itemKey, itemLabel } = props;
  const search = usePickerSearch(props);
  const anchor = useComboboxAnchor();
  return (
    <div data-slot="entity-picker" className={cn("min-w-0", className)}>
      <Combobox
        multiple
        items={search.items}
        filter={null}
        itemToStringLabel={itemLabel}
        isItemEqualToValue={(item, chosen) => itemKey(item) === itemKey(chosen)}
        value={props.value}
        defaultValue={props.defaultValue}
        onValueChange={(value) => {
          props.onValueChange?.(value);
        }}
        onInputValueChange={search.handleInputValueChange}
        disabled={props.disabled ?? false}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(chosen: readonly TItem[]) => (
              <>
                {chosen.map((item) => (
                  <ComboboxChip key={itemKey(item)}>{itemLabel(item)}</ComboboxChip>
                ))}
                <ComboboxChipsInput
                  {...inputProps(props, search.state)}
                  disabled={props.disabled ?? false}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <PickerContent
          state={search.state}
          hint={search.hint}
          itemKey={itemKey}
          itemLabel={itemLabel}
          renderItem={props.renderItem}
          anchor={anchor}
        />
      </Combobox>
    </div>
  );
}

/** A combobox that searches as the user types. Label it with a `FieldLabel` whose `htmlFor` is its `id`, or with
 * `aria-label`.
 *
 * @example
 * ```tsx
 * import { EntityPicker, Field, FieldLabel } from "@basis/ui";
 *
 * interface Issuer {
 *   readonly id: string;
 *   readonly name: string;
 * }
 *
 * const issuers: readonly Issuer[] = [{ id: "ust", name: "US Treasury" }];
 *
 * <Field>
 *   <FieldLabel htmlFor="issuer">Issuer</FieldLabel>
 *   <EntityPicker
 *     id="issuer"
 *     search={async (text) =>
 *       Promise.resolve(issuers.filter((issuer) => issuer.name.toLowerCase().includes(text.toLowerCase())))
 *     }
 *     itemKey={(issuer) => issuer.id}
 *     itemLabel={(issuer) => issuer.name}
 *     onValueChange={() => undefined}
 *   />
 * </Field>;
 * ```
 */
function EntityPicker<TItem>(props: EntityPickerProps<TItem>): ReactElement {
  return props.multiple === true ? (
    <MultipleEntityPicker {...props} />
  ) : (
    <SingleEntityPicker {...props} />
  );
}

export { EntityPicker };
