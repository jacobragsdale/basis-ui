/* EntityPicker's popup: the status line, which says what the search is doing in words a screen reader hears
 * politely, then the results. */

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import type { ReactElement, ReactNode, RefObject } from "react";

import { describeError } from "#shell/describe-error.ts";
import { LoaderCircleIcon } from "#vendor/lucide/loader-circle.tsx";

import { ComboboxContent, ComboboxItem, ComboboxList } from "./combobox.tsx";
import type { EntityPickerBaseProps } from "./entity-picker-props.ts";
import type { EntitySearchState } from "./entity-search.ts";

/** What the status line says about the search. */
function statusText<TItem>(state: EntitySearchState<TItem>, hint: string): ReactNode {
  switch (state.status) {
    case "idle": {
      return hint;
    }
    case "searching": {
      return (
        <>
          <span className="flex [&>svg]:animate-spin motion-reduce:[&>svg]:animate-none">
            <LoaderCircleIcon className="size-(--control-md-icon)" />
          </span>
          Searching…
        </>
      );
    }
    case "invalid": {
      return <span className="text-destructive">{state.reason}</span>;
    }
    case "failed": {
      const { title, detail } = describeError(state.error);
      return (
        <span className="text-destructive">
          {detail === undefined ? title : `${title}: ${detail}`}
        </span>
      );
    }
    case "found": {
      return state.items.length === 0 ? `No matches for "${state.text}".` : null;
    }
    default: {
      return null;
    }
  }
}

/** The popup: the status line, then the results. */
function PickerContent<TItem>({
  state,
  hint,
  itemKey,
  itemLabel,
  renderItem,
  anchor,
}: Pick<EntityPickerBaseProps<TItem>, "itemKey" | "itemLabel" | "renderItem"> & {
  readonly state: EntitySearchState<TItem>;
  readonly hint: string;
  readonly anchor?: RefObject<HTMLDivElement | null>;
}): ReactElement {
  return (
    <ComboboxContent anchor={anchor}>
      <ComboboxPrimitive.Status
        data-slot="entity-picker-status"
        className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground empty:p-0"
      >
        {statusText(state, hint)}
      </ComboboxPrimitive.Status>
      <ComboboxList>
        {(item: TItem) => (
          <ComboboxItem key={itemKey(item)} value={item}>
            {renderItem === undefined ? itemLabel(item) : renderItem(item)}
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );
}

export { PickerContent };
