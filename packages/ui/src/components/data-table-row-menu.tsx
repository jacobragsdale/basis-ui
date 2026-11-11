/* DataTable's row actions: a button in each row, and one menu for the whole table, made when it opens beside the
 * button that opened it (data-table-menu.tsx). A row's button is the browser's own, drawn as a ghost Button: Base UI's
 * trigger, one a row, cost a table at its row cap more than the rest of its rows did. The table asks for a row's
 * actions only when its menu opens. */

import { cn } from "cn";
import type { ReactElement } from "react";

import { EllipsisIcon } from "#vendor/lucide/ellipsis.tsx";

import { buttonVariants } from "./button-variants.ts";
import type { DataTableRowAction } from "./data-table-columns.ts";
import { AnchoredMenuContent } from "./data-table-menu.tsx";
import type { AnchoredMenu } from "./data-table-menu.tsx";
import { DropdownMenuItem } from "./dropdown-menu.tsx";
import { tableCellClasses } from "./table-variants.ts";

/** The row whose menu is open, or was last: its id, beside its button. */
interface RowMenu extends AnchoredMenu {
  readonly id: string;
}

/** Opens the menu for a row, beside its button. */
type OpenRowMenu = (id: string, anchor: HTMLElement, keyboard: boolean) => void;

const actionsCellClasses = `${tableCellClasses.default} w-0 text-right`;
const actionsButtonClasses = cn(buttonVariants({ size: "icon-sm", variant: "ghost" }));

/** A row's button, named after the row, which opens the table's menu with the row's actions. */
function RowActionsCell({
  id,
  label,
  open,
  onOpen,
}: {
  readonly id: string;
  readonly label: string;
  /** Whether the menu is open for this row. */
  readonly open: boolean;
  readonly onOpen: OpenRowMenu;
}): ReactElement {
  return (
    <td data-slot="table-cell" data-variant="default" className={actionsCellClasses}>
      <button
        type="button"
        data-slot="button"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={actionsButtonClasses}
        onClick={(event) => {
          // A click the keyboard makes, by Enter or Space, has no pointer's count of clicks.
          onOpen(id, event.currentTarget, event.detail === 0);
        }}
      >
        <EllipsisIcon />
      </button>
    </td>
  );
}

interface RowMenuProps<TRow> {
  readonly rows: readonly TRow[];
  readonly getRowId: (row: TRow) => string;
  readonly rowActions: (row: TRow) => readonly DataTableRowAction[];
}

/** The open menu's items: the actions of the row whose button opened it. */
function RowMenuItems<TRow>({
  id,
  rows,
  getRowId,
  rowActions,
}: RowMenuProps<TRow> & { readonly id: string }): ReactElement {
  const row = rows.find((candidate) => getRowId(candidate) === id);
  return (
    <>
      {(row === undefined ? [] : rowActions(row)).map((action) => (
        <DropdownMenuItem
          key={action.label}
          variant={action.variant ?? "default"}
          disabled={action.disabled ?? false}
          onClick={() => {
            action.onSelect();
          }}
        >
          {action.label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** The table's one row menu, beside the button of the row it is open for. */
function RowActionsMenu<TRow>({
  menu,
  onClose,
  ...props
}: RowMenuProps<TRow> & {
  readonly menu: RowMenu;
  readonly onClose: () => void;
}): ReactElement {
  return (
    <AnchoredMenuContent menu={menu} onClose={onClose}>
      <RowMenuItems id={menu.id} {...props} />
    </AnchoredMenuContent>
  );
}

export { RowActionsCell, RowActionsMenu };
export type { OpenRowMenu, RowMenu };
