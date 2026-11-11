/* DataTable's state that an app may hold: each part a value, a change that tells the app, and a default for a table
 * that holds its own. The row selection is by row id, kept to the rows the data holds, so a change can tell the app
 * which rows are chosen, and new data, such as a refetch's, keeps the rows it still holds and tells the app again. */

import { functionalUpdate } from "@tanstack/react-table";
import type { RowSelectionState, Updater } from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";

import type { DataTableSort } from "./data-table-columns.ts";

/** What hears the selection: the selected rows, in the data's order, and their ids. */
type SelectionListener<TRow> = (rows: readonly TRow[], ids: readonly string[]) => void;

/** The parts of a DataTable's state an app may hold, each with the change that tells it and a default. */
interface DataTableStateProps<TRow> {
  /** The sort, by column `id`, ascending unless `desc` is set, held by the app; the table holds it unless set. */
  readonly sorting?: readonly DataTableSort[] | undefined;
  /** The sort it starts with when the table holds it; the data's order unless set. */
  readonly defaultSorting?: readonly DataTableSort[] | undefined;
  /** Hears the sort a heading asks for, with `desc` on each column. */
  readonly onSortingChange?: ((sorting: readonly DataTableSort[]) => void) | undefined;
  /** The text filter's text, held by the app; the table holds it unless set. */
  readonly filter?: string | undefined;
  /** The text the filter starts with when the table holds it; none unless set. */
  readonly defaultFilter?: string | undefined;
  /** Hears the text typed once typing pauses, or at once on Enter. */
  readonly onFilterChange?: ((filter: string) => void) | undefined;
  /** The ids of the columns hidden, held by the app; the table holds them unless set. */
  readonly hiddenColumns?: readonly string[] | undefined;
  /** The columns hidden when the table holds them; none unless set. */
  readonly defaultHiddenColumns?: readonly string[] | undefined;
  /** Hears the ids of the columns hidden after the columns menu hides or shows one. */
  readonly onHiddenColumnsChange?: ((hidden: readonly string[]) => void) | undefined;
  /** The page showing, from 0, held by the app; the table holds it unless set. A page past the last shows the last. */
  readonly page?: number | undefined;
  /** The page it starts on when the table holds it; the first unless set. */
  readonly defaultPage?: number | undefined;
  /** Hears the page a button asks for, and 0 when a new sort or filter goes back to the first. */
  readonly onPageChange?: ((page: number) => void) | undefined;
  /** The ids of the rows selected, held by the app; the table holds them unless set. */
  readonly selectedIds?: readonly string[] | undefined;
  /** The ids selected when the table holds them, among the rows it holds; none unless set. */
  readonly defaultSelectedIds?: readonly string[] | undefined;
  /** Hears the selected rows, in order, and their ids on each change and when new data drops or replaces one. */
  readonly onSelectionChange?: SelectionListener<TRow> | undefined;
}

/** A part of the state: the app's value when it holds one, else the table's own from `initial`; a change goes to
 * `onChange` either way, and to the table's own value when the app holds none. */
function useControllable<TValue>(
  value: TValue | undefined,
  initial: TValue,
  onChange: ((next: TValue) => void) | undefined,
): readonly [TValue, (next: TValue) => void] {
  const [own, setOwn] = useState(initial);
  const set = (next: TValue): void => {
    if (value === undefined) {
      setOwn(next);
    }
    onChange?.(next);
  };
  return [value ?? own, set];
}

/** The ids as TanStack's selection. */
function selectionOf(ids: readonly string[]): RowSelectionState {
  return Object.fromEntries(ids.map((id) => [id, true]));
}

/** The selection, keeping only the chosen rows whose ids `ids` holds. */
function keptSelection(selection: RowSelectionState, ids: ReadonlySet<string>): RowSelectionState {
  return Object.fromEntries(
    Object.entries(selection).filter(([id, chosen]) => chosen && ids.has(id)),
  );
}

/** The rows the selection holds, in the data's order. */
function selectedIn<TRow>(
  data: readonly TRow[],
  selection: RowSelectionState,
  getRowId: (row: TRow) => string,
): TRow[] {
  return data.filter((row) => selection[getRowId(row)] === true);
}

/** Whether two lists hold the same rows, in the same order. */
function sameRows<TRow>(left: readonly TRow[], right: readonly TRow[]): boolean {
  return left.length === right.length && left.every((row, index) => row === right[index]);
}

const noIds: readonly string[] = [];

/** The selection as TanStack takes it, and the change TanStack sends it. */
interface RowSelection {
  readonly rowSelection: RowSelectionState;
  readonly change: (updater: Updater<RowSelectionState>) => void;
}

/** The row selection, by id, kept to the rows `data` holds: the app's ids when it holds them. The app hears the
 * selected rows and their ids on each change, and again when new data arrives whose selected rows differ from those
 * it heard of: the rows as the new data holds them, without those it dropped. Data made afresh each render from the
 * same rows tells it nothing. */
function useRowSelection<TRow>(
  data: readonly TRow[],
  getRowId: (row: TRow) => string,
  { selectedIds, defaultSelectedIds, onSelectionChange }: DataTableStateProps<TRow>,
): RowSelection {
  const [own, setOwn] = useState(() => selectionOf(defaultSelectedIds ?? noIds));
  const chosen = selectedIds === undefined ? own : selectionOf(selectedIds);
  const rowSelection = keptSelection(chosen, new Set(data.map((row) => getRowId(row))));
  // The rows the app last heard of, and the data it last heard of them in.
  const heard = useRef<readonly TRow[]>([]);
  const heardIn = useRef(data);
  const report = (rows: readonly TRow[]): void => {
    heard.current = rows;
    onSelectionChange?.(
      rows,
      rows.map((row) => getRowId(row)),
    );
  };
  useEffect(() => {
    if (heardIn.current !== data) {
      heardIn.current = data;
      const rows = selectedIn(data, rowSelection, getRowId);
      if (!sameRows(rows, heard.current)) {
        report(rows);
      }
    }
  });
  return {
    change: (updater) => {
      const next = functionalUpdate(updater, rowSelection);
      if (selectedIds === undefined) {
        setOwn(next);
      }
      report(selectedIn(data, next, getRowId));
    },
    rowSelection,
  };
}

export { useControllable, useRowSelection };
export type { DataTableStateProps, RowSelection, SelectionListener };
