/* The field list's Filters area's own state: columns put there that filter nothing yet, and the column whose editor is
 * open. The panel holds it, so that the field list, a chip's menu and a drop can each open a column's editor. */

import { useState } from "react";

/** The Filters area's own state: columns put here that filter nothing yet, and the column whose editor is open. */
interface FilterChips {
  readonly added: readonly string[];
  readonly open: string | null;
  /** Adds a chip for `column`, if it has none, and opens its editor. */
  readonly filterBy: (column: string) => void;
  /** Opens `column`'s editor, keeping its chip until it is removed, or closes the editor for null. */
  readonly setOpen: (column: string | null) => void;
  /** Takes `column`'s chip away. */
  readonly forget: (column: string) => void;
}

/** The Filters area's state, which the field list and the group menus open editors in. */
function useFilterChips(): FilterChips {
  const [added, setAdded] = useState<readonly string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  // A chip whose editor opens stays while the editor is used, even once its last value is unticked.
  const openOn = (column: string | null): void => {
    if (column !== null) {
      setAdded((before) => (before.includes(column) ? before : [...before, column]));
    }
    setOpen(column);
  };
  return {
    added,
    filterBy: openOn,
    forget: (column) => {
      setAdded((before) => before.filter((name) => name !== column));
      setOpen((before) => (before === column ? null : before));
    },
    open,
    setOpen: openOn,
  };
}

export { useFilterChips };
export type { FilterChips };
