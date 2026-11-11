/* DataTable's menus, its row menu and its columns menu, each made when it first opens, beside the button that opened
 * it, rather than as Base UI's Menu with a trigger of its own: Base UI's menu costs a first draw while it is still
 * closed, and a table at its row cap draws a button a row. The menu takes the focus as Base UI's does for its own
 * trigger, on its first item when the keyboard opened it, and gives it back to the button when it closes. */

import { useRef } from "react";
import type { ReactElement, ReactNode } from "react";

import { DropdownMenu, DropdownMenuContent } from "./dropdown-menu.tsx";

/** A menu opened from a plain button: the button, whether the keyboard opened it, and whether it is open still. It is
 * kept once closed, so the menu can close as it opened. */
interface AnchoredMenu {
  readonly anchor: HTMLElement;
  readonly keyboard: boolean;
  readonly open: boolean;
}

/** The first item a menu's keyboard user lands on. */
const firstItem = '[role^="menuitem"]:not([aria-disabled="true"])';

/** A menu beside the button `menu` names, open while `menu.open` is. */
function AnchoredMenuContent({
  menu,
  onClose,
  children,
}: {
  readonly menu: AnchoredMenu;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactElement {
  const popup = useRef<HTMLDivElement>(null);
  return (
    <DropdownMenu
      open={menu.open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onOpenChangeComplete={(open) => {
        if (open && menu.keyboard) {
          popup.current?.querySelector<HTMLElement>(firstItem)?.focus();
        }
      }}
    >
      <DropdownMenuContent
        ref={popup}
        anchor={menu.anchor}
        finalFocus={() => (menu.anchor.isConnected ? menu.anchor : true)}
        align="end"
        className="w-auto"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { AnchoredMenuContent };
export type { AnchoredMenu };
