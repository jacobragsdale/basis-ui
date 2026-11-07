/* useComboboxAnchor, from shadcn's Base UI source: the ref that lines a multiple combobox's popup up with its chips.
 * It sits apart from combobox.tsx because a component file exports only components (`react/only-export-components`). */

import { useRef } from "react";
import type { RefObject } from "react";

/** A ref for ComboboxChips, passed to ComboboxContent as `anchor` so the popup lines up with the chips. */
function useComboboxAnchor(): RefObject<HTMLDivElement | null> {
  return useRef<HTMLDivElement | null>(null);
}

export { useComboboxAnchor };
