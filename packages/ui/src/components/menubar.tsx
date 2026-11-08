/* Menubar and its parts, from shadcn's Base UI source (its base-nova style): a row of menus, each a Dropdown Menu.
 * shadcn builds most parts by passing classes to Dropdown Menu's parts, which `shadcn/no-restyle` forbids, so:
 * - the content, item, separator, shortcut, submenu trigger and submenu content are Dropdown Menu's parts under
 *   Menubar's `data-slot` names, without shadcn's extra classes, which repeat Dropdown Menu's but for the theme's
 *   missing `shadow-lg`;
 * - the trigger, label, checkbox item and radio item, whose look differs from Dropdown Menu's, render Base UI's parts
 *   with shadcn's classes.
 * The bar's arbitrary 3px padding is the spacing scale's `0.5`, its triggers' arbitrary 2px is `py-0.5`, and the
 * triggers and items carry `min-h-target` and `min-w-target`, so they keep a 24 px target in the compact density;
 * the bar is at least `h-8` rather than exactly, so that it holds them there. */

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Menubar as MenubarPrimitive } from "@base-ui/react/menubar";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { CheckIcon } from "#vendor/lucide/check.tsx";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "./dropdown-menu.tsx";

/** shadcn's shift, in pixels, of a menu to line its items up with its trigger's text. */
const menuShift = -4;
/** shadcn's gap, in pixels, between a menu and the bar. */
const menuGap = 8;

/** A menubar: a row of menus, as at the top of a desktop application. The arrow keys move between its menus and
 * through each one's items, and Escape closes the open menu and returns focus to its trigger.
 *
 * @example
 * ```tsx
 * import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "@basis/ui";
 *
 * <Menubar>
 *   <MenubarMenu>
 *     <MenubarTrigger>File</MenubarTrigger>
 *     <MenubarContent>
 *       <MenubarItem onClick={() => undefined}>Export</MenubarItem>
 *     </MenubarContent>
 *   </MenubarMenu>
 * </Menubar>;
 * ```
 */
function Menubar({ className, ...props }: MenubarPrimitive.Props): ReactElement {
  return (
    <MenubarPrimitive
      data-slot="menubar"
      className={cn("flex min-h-8 items-center gap-0.5 rounded-lg border p-0.5", className)}
      {...props}
    />
  );
}

/** One of the bar's menus: a MenubarTrigger and its MenubarContent. */
function MenubarMenu(props: ComponentProps<typeof DropdownMenu>): ReactElement {
  return <DropdownMenu data-slot="menubar-menu" {...props} />;
}

/** A group of a menubar menu's items, which a `MenubarSeparator` sets apart from the next. */
function MenubarGroup(props: ComponentProps<typeof DropdownMenuGroup>): ReactElement {
  return <DropdownMenuGroup data-slot="menubar-group" {...props} />;
}

/** Renders a menubar menu's popup into the page's body. `MenubarContent` includes one. */
function MenubarPortal(props: ComponentProps<typeof DropdownMenuPortal>): ReactElement {
  return <DropdownMenuPortal data-slot="menubar-portal" {...props} />;
}

/** The menu's name in the bar, which opens it. */
function MenubarTrigger({ className, ...props }: MenuPrimitive.Trigger.Props): ReactElement {
  return (
    <MenuPrimitive.Trigger
      data-slot="menubar-trigger"
      className={cn(
        "flex min-h-target min-w-target items-center rounded-sm px-1.5 py-0.5 text-sm font-medium outline-hidden select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

/** The menu's popup, under its trigger. */
function MenubarContent({
  align = "start",
  alignOffset = menuShift,
  sideOffset = menuGap,
  className,
  ...props
}: ComponentProps<typeof DropdownMenuContent>): ReactElement {
  return (
    <DropdownMenuContent
      data-slot="menubar-content"
      align={align}
      alignOffset={alignOffset}
      sideOffset={sideOffset}
      className={cn("min-w-36", className)}
      {...props}
    />
  );
}

/** An action. `variant="destructive"` marks one that deletes or cannot be undone; `inset` lines it up with items that
 * have an icon. */
function MenubarItem(
  props: MenuPrimitive.Item.Props & {
    readonly inset?: boolean;
    readonly variant?: "default" | "destructive";
  },
): ReactElement {
  return <DropdownMenuItem data-slot="menubar-item" {...props} />;
}

/** An option that is on or off, with a check at its start when on. */
function MenubarCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & { readonly inset?: boolean }): ReactElement {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menubar-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-target min-w-target cursor-default items-center gap-1.5 rounded-md py-1 pr-1.5 pl-7 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[inset=true]:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-1.5 flex size-4 items-center justify-center [&_svg:not([class*='size-'])]:size-4">
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

/** Options of which one is chosen, each a MenubarRadioItem. */
function MenubarRadioGroup(props: ComponentProps<typeof DropdownMenuRadioGroup>): ReactElement {
  return <DropdownMenuRadioGroup data-slot="menubar-radio-group" {...props} />;
}

/** One option of a MenubarRadioGroup, with a check at its start when chosen. */
function MenubarRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & { readonly inset?: boolean }): ReactElement {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menubar-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-target min-w-target cursor-default items-center gap-1.5 rounded-md py-1 pr-1.5 pl-7 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[inset=true]:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-1.5 flex size-4 items-center justify-center [&_svg:not([class*='size-'])]:size-4">
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

/** A group's heading, inside its MenubarGroup. `inset` lines it up with items that have an icon. */
function MenubarLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & { readonly inset?: boolean }): ReactElement {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menubar-label"
      data-inset={inset}
      className={cn("px-1.5 py-1 text-sm font-medium data-[inset=true]:pl-7", className)}
      {...props}
    />
  );
}

/** A line between groups of a menubar menu's items. */
function MenubarSeparator(props: ComponentProps<typeof DropdownMenuSeparator>): ReactElement {
  return <DropdownMenuSeparator data-slot="menubar-separator" {...props} />;
}

/** An item's keyboard shortcut, at its end. It only shows the shortcut; the app binds the keys. */
function MenubarShortcut(props: ComponentProps<typeof DropdownMenuShortcut>): ReactElement {
  return <DropdownMenuShortcut data-slot="menubar-shortcut" {...props} />;
}

/** Holds a submenu: a MenubarSubTrigger and its MenubarSubContent. */
function MenubarSub(props: ComponentProps<typeof DropdownMenuSub>): ReactElement {
  return <DropdownMenuSub data-slot="menubar-sub" {...props} />;
}

/** The item that opens a submenu, on hover, a click, Enter or the right arrow key. */
function MenubarSubTrigger(props: ComponentProps<typeof DropdownMenuSubTrigger>): ReactElement {
  return <DropdownMenuSubTrigger data-slot="menubar-sub-trigger" {...props} />;
}

/** The submenu's popup, beside its trigger. */
function MenubarSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuSubContent>): ReactElement {
  return (
    <DropdownMenuSubContent
      data-slot="menubar-sub-content"
      className={cn("min-w-32", className)}
      {...props}
    />
  );
}

export {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
};
