/* EntityPicker's props, and the state both of its forms share: the typed text, the search for it, and the props its
 * input takes. They sit apart from entity-picker.tsx so that its file holds only components. */

import type { QueryKey } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { useEntitySearch } from "./entity-search.ts";
import type { EntitySearch, EntitySearchState } from "./entity-search.ts";

/** What both forms of the picker take. */
interface EntityPickerBaseProps<TItem> {
  /** Finds the items matching the typed text, which is trimmed and at least `minLength` long; pass `signal` on to the
   * request, so a search a newer text replaced is aborted. */
  readonly search: EntitySearch<TItem>;
  /** An item's stable id, which tells a result from a choice already made. */
  readonly itemKey: (item: TItem) => string;
  /** An item as text: in the input once chosen, on its chip, and in the list unless `renderItem` is set. */
  readonly itemLabel: (item: TItem) => string;
  /** What a result shows in the list, such as its name and its CUSIP. */
  readonly renderItem?: ((item: TItem) => ReactNode) | undefined;
  /** Why a text cannot be searched, such as a malformed identifier, or `undefined` when it can. The picker shows the
   * reason and does not search. */
  readonly validate?: ((text: string) => string | undefined) | undefined;
  /** How long typing must stop before the picker searches; 250 ms unless set. */
  readonly debounceMs?: number | undefined;
  /** What the status line says before there is enough text to search; "Type to search." unless set. */
  readonly hint?: string | undefined;
  /** The fewest characters it searches for; 1 unless set. */
  readonly minLength?: number | undefined;
  /** The search's key in the query cache, which the picker adds the text to, such as the generated client's
   * `getSearchIssuersQueryKey()`; the picker's own unless set, so no two pickers share results. */
  readonly queryKey?: QueryKey | undefined;
  /** The input's id, which a `FieldLabel`'s `htmlFor` names. */
  readonly id?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly "aria-label"?: string | undefined;
  readonly "aria-describedby"?: string | undefined;
  readonly "aria-invalid"?: boolean | undefined;
  /** Places the picker, as with `w-80`; its look is fixed. */
  readonly className?: string | undefined;
}

/** A picker that chooses one item, or none. */
interface SingleEntityPickerProps<TItem> extends EntityPickerBaseProps<TItem> {
  readonly multiple?: false | undefined;
  readonly value?: TItem | null | undefined;
  readonly defaultValue?: TItem | null | undefined;
  readonly onValueChange?: ((value: TItem | null) => void) | undefined;
}

/** A picker that chooses several items, shown as chips. */
interface MultipleEntityPickerProps<TItem> extends EntityPickerBaseProps<TItem> {
  readonly multiple: true;
  readonly value?: readonly TItem[] | undefined;
  readonly defaultValue?: readonly TItem[] | undefined;
  readonly onValueChange?: ((value: readonly TItem[]) => void) | undefined;
}

type EntityPickerProps<TItem> = SingleEntityPickerProps<TItem> | MultipleEntityPickerProps<TItem>;

const defaultDebounceMs = 250;
const noItems: readonly never[] = [];

/** Whether the input changed because the user typed or pasted, rather than because a choice filled or cleared it. */
function isTyping(reason: string): boolean {
  return reason === "input-change" || reason === "input-paste";
}

/** What the status line says before there is enough text to search, by the fewest characters searched for. */
function hintFor(minLength: number): string {
  return minLength > 1
    ? `Type at least ${String(minLength)} characters to search.`
    : "Type to search.";
}

/** The typed text and the search for it. */
function usePickerSearch<TItem>(props: EntityPickerBaseProps<TItem>): {
  readonly state: EntitySearchState<TItem>;
  readonly items: readonly TItem[];
  /** What the status line says before there is enough text to search. */
  readonly hint: string;
  readonly handleInputValueChange: (value: string, details: { readonly reason: string }) => void;
} {
  const [text, setText] = useState("");
  const minLength = props.minLength ?? 1;
  const state = useEntitySearch({
    debounceMs: props.debounceMs ?? defaultDebounceMs,
    minLength,
    queryKey: props.queryKey,
    search: props.search,
    text,
    validate: props.validate,
  });
  return {
    handleInputValueChange: (value, { reason }) => {
      setText(isTyping(reason) ? value : "");
    },
    hint: props.hint ?? hintFor(minLength),
    items: state.status === "found" ? state.items : noItems,
    state,
  };
}

/** The input's props, from the app's, with `aria-invalid` set while the text cannot be searched. */
function inputProps<TItem>(
  props: EntityPickerBaseProps<TItem>,
  state: EntitySearchState<TItem>,
): {
  readonly id: string | undefined;
  readonly placeholder: string | undefined;
  readonly "aria-label": string | undefined;
  readonly "aria-describedby": string | undefined;
  readonly "aria-invalid": boolean | undefined;
} {
  return {
    "aria-describedby": props["aria-describedby"],
    "aria-invalid": state.status === "invalid" ? true : props["aria-invalid"],
    "aria-label": props["aria-label"],
    id: props.id,
    placeholder: props.placeholder,
  };
}

export { inputProps, usePickerSearch };
export type {
  EntityPickerBaseProps,
  EntityPickerProps,
  MultipleEntityPickerProps,
  SingleEntityPickerProps,
};
