/* Context Menu and its parts, from shadcn's Base UI source (its base-nova style). Base UI's Context Menu is its Menu
 * opened by a right click or a long press, and shares Menu's items, so its items, labels, separators, shortcuts and
 * submenu trigger here are Dropdown Menu's parts under Context Menu's `data-slot` names, where shadcn copies their
 * classes. Dropdown Menu's header lists the changes to those classes. The popup fades and scales through Base UI's
 * `data-starting-style` and `data-ending-style`, in place of tw-animate-css's keyframes, which the theme lacks, and
 * the submenu's popup drops shadcn's `shadow-lg`, which the theme lacks. */

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSubTrigger,
} from "./dropdown-menu.tsx";

/** shadcn's shift, in pixels, of the menu down from the pointer, so that the pointer is not over its first item. */
const alignShift = 4;

/** A context menu: actions on what is under the pointer, opened by a right click or a long press on its trigger, or
 * by the keyboard's context-menu key or Shift+F10. Arrow keys move through its items, Enter or a click runs one, and
 * Escape closes the menu.
 *
 * @example
 * ```tsx
 * import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@basis/ui";
 *
 * <ContextMenu>
 *   <ContextMenuTrigger>Right-click a position</ContextMenuTrigger>
 *   <ContextMenuContent>
 *     <ContextMenuItem onClick={() => undefined}>Allocate</ContextMenuItem>
 *     <ContextMenuItem onClick={() => undefined}>Copy CUSIP</ContextMenuItem>
 *   </ContextMenuContent>
 * </ContextMenu>;
 * ```
 */
function ContextMenu(props: ContextMenuPrimitive.Root.Props): ReactElement {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

/** Renders the context menu's popup into the page's body. `ContextMenuContent` includes one. */
function ContextMenuPortal(props: ContextMenuPrimitive.Portal.Props): ReactElement {
  return <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />;
}

/** The area a right click opens the menu on. */
function ContextMenuTrigger({
  className,
  ...props
}: ContextMenuPrimitive.Trigger.Props): ReactElement {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn("select-none", className)}
      {...props}
    />
  );
}

/** The menu's popup, in a portal, at the pointer. */
function ContextMenuContent({
  className,
  align = "start",
  alignOffset = alignShift,
  side = "right",
  sideOffset = 0,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >): ReactElement {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-popup outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            "z-popup max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-edge transition duration-popup outline-none data-closed:overflow-hidden data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

/** Items that belong together, named by a ContextMenuLabel inside it. */
function ContextMenuGroup(props: ContextMenuPrimitive.Group.Props): ReactElement {
  return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />;
}

/** A group's heading, inside its ContextMenuGroup. `inset` lines it up with items that have an icon. */
function ContextMenuLabel(
  props: ContextMenuPrimitive.GroupLabel.Props & { readonly inset?: boolean },
): ReactElement {
  return <DropdownMenuLabel data-slot="context-menu-label" {...props} />;
}

/** An action. `variant="destructive"` marks one that deletes or cannot be undone; `inset` lines it up with items that
 * have an icon. */
function ContextMenuItem(
  props: ContextMenuPrimitive.Item.Props & {
    readonly inset?: boolean;
    readonly variant?: "default" | "destructive";
  },
): ReactElement {
  return <DropdownMenuItem data-slot="context-menu-item" {...props} />;
}

/** Holds a submenu: a ContextMenuSubTrigger and its ContextMenuSubContent. */
function ContextMenuSub(props: ContextMenuPrimitive.SubmenuRoot.Props): ReactElement {
  return <ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />;
}

/** The item that opens a submenu, on hover, a click, Enter or the right arrow key. */
function ContextMenuSubTrigger(
  props: ContextMenuPrimitive.SubmenuTrigger.Props & { readonly inset?: boolean },
): ReactElement {
  return <DropdownMenuSubTrigger data-slot="context-menu-sub-trigger" {...props} />;
}

/** The submenu's popup, beside its trigger. */
function ContextMenuSubContent(props: ComponentProps<typeof ContextMenuContent>): ReactElement {
  return <ContextMenuContent data-slot="context-menu-sub-content" side="right" {...props} />;
}

/** An option that is on or off, with a check at its end when on. */
function ContextMenuCheckboxItem(
  props: ContextMenuPrimitive.CheckboxItem.Props & { readonly inset?: boolean },
): ReactElement {
  return <DropdownMenuCheckboxItem data-slot="context-menu-checkbox-item" {...props} />;
}

/** Options of which one is chosen, each a ContextMenuRadioItem. */
function ContextMenuRadioGroup(props: ContextMenuPrimitive.RadioGroup.Props): ReactElement {
  return <ContextMenuPrimitive.RadioGroup data-slot="context-menu-radio-group" {...props} />;
}

/** One option of a ContextMenuRadioGroup, with a check at its end when chosen. */
function ContextMenuRadioItem(
  props: ContextMenuPrimitive.RadioItem.Props & { readonly inset?: boolean },
): ReactElement {
  return <DropdownMenuRadioItem data-slot="context-menu-radio-item" {...props} />;
}

/** A line between groups of a context menu's items. */
function ContextMenuSeparator(props: ContextMenuPrimitive.Separator.Props): ReactElement {
  return <DropdownMenuSeparator data-slot="context-menu-separator" {...props} />;
}

/** An item's keyboard shortcut, at its end. It only shows the shortcut; the app binds the keys. */
function ContextMenuShortcut(props: ComponentProps<"span">): ReactElement {
  return <DropdownMenuShortcut data-slot="context-menu-shortcut" {...props} />;
}

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
