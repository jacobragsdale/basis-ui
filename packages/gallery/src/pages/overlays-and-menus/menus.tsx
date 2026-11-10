/* Dropdown Menu and Context Menu on the overlays and menus page: a position's actions behind a button, with every
 * kind of item, and the same actions on a right click. */

import {
  Button,
  ChevronDownIcon,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  CopyIcon,
  DownloadIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  PencilIcon,
  TrashIcon,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { focused, openedByKeyboard, usePictured } from "#pages/shot.ts";

/** The position's actions, with icons and shortcuts, and a submenu that moves it to another model. */
function DropdownMenuActions(): ReactElement {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Position</DropdownMenuLabel>
      <DropdownMenuItem {...focused}>
        <PencilIcon />
        Edit
        <DropdownMenuShortcut>Ctrl+E</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem>
        <CopyIcon />
        Duplicate
        <DropdownMenuShortcut>Ctrl+D</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem disabled>
        <DownloadIcon />
        Export to Excel
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger inset>Move to</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem>Core Plus</DropdownMenuItem>
          <DropdownMenuItem>Short Duration</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuGroup>
  );
}

/** Options: columns that are on or off, and the one way prices show. */
function DropdownMenuOptions(): ReactElement {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuCheckboxItem defaultChecked>Yield</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Spread</DropdownMenuCheckboxItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup defaultValue="clean">
        <DropdownMenuLabel>Price</DropdownMenuLabel>
        <DropdownMenuRadioItem value="clean">Clean</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dirty">Dirty</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}

function DropdownMenuExample(): ReactElement {
  return (
    <DropdownMenu defaultOpen={usePictured()}>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Actions
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuActions />
        <DropdownMenuSeparator />
        <DropdownMenuOptions />
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <TrashIcon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A row's actions on a right click, or on the context-menu key or Shift+F10 while the row has focus. */
function ContextMenuExample(): ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger className="block" {...openedByKeyboard("Shift+F10")}>
        <button
          type="button"
          className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        >
          UST 4.25% 2034, 5,000,000 par
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuGroup>
          <ContextMenuLabel>Row</ContextMenuLabel>
          <ContextMenuItem>
            <CopyIcon />
            Copy
            <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem {...focused}>
            <PencilIcon />
            Edit
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>Group by</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Sector</ContextMenuItem>
              <ContextMenuItem>Rating</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem defaultChecked>Show totals</ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel>Price as</ContextMenuLabel>
          <ContextMenuRadioGroup defaultValue="clean">
            <ContextMenuRadioItem value="clean">Clean</ContextMenuRadioItem>
            <ContextMenuRadioItem value="dirty">Dirty</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">
          <TrashIcon />
          Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MenuSections(): ReactElement {
  return (
    <>
      <Section
        title="Dropdown Menu"
        description="Actions and options behind a button. Arrow keys move through them, Enter runs one, Escape closes."
      >
        <div className="flex flex-wrap gap-2">
          <DropdownMenuExample />
        </div>
      </Section>
      <Section
        title="Context Menu"
        description="Actions on what is under the pointer, on a right click, the context-menu key or Shift+F10."
      >
        <ContextMenuExample />
      </Section>
    </>
  );
}

export { ContextMenuExample, DropdownMenuExample, MenuSections };
