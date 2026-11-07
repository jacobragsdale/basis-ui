/* Dropdown Menu and its parts, from shadcn's Base UI source (its base-nova style), on Base UI's Menu. Context Menu
 * and Menubar draw their items with these parts. The changes:
 * - The popup fades and scales from its anchor through Base UI's `data-starting-style` and `data-ending-style` on a
 *   short transition, which the theme's reduced-motion rule stops, in place of tw-animate-css's keyframes, which the
 *   theme lacks.
 * - A destructive item, when highlighted, sits on the theme's `destructive-subtle` tint, where shadcn tints it with an
 *   opacity of `destructive` and a `dark:` class.
 * - Items carry `min-h-target` and `min-w-target`, since they are shorter than `h-8`, so they keep a 24 px target in
 *   the compact density.
 * - The submenu's popup is the menu's popup with `w-auto min-w-24` in place of shadcn's restyling with an arbitrary
 *   96px and `shadow-lg`, which the theme lacks.
 * - `inset` pads an item only when it is true, where shadcn's `data-inset:` also matches `data-inset="false"`, and the
 *   submenu trigger drops shadcn's `data-open:` classes, since Base UI marks it `data-popup-open` alone. */

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import { CheckIcon } from "#vendor/lucide/check.tsx";
import { ChevronRightIcon } from "#vendor/lucide/chevron-right.tsx";

/** shadcn's gap, in pixels, between the popup and its trigger. */
const sideGap = 4;
/** shadcn's shift, in pixels, of a submenu up so that its first item lines up with its trigger: the popup's padding
 * and ring. */
const submenuShift = -3;

/** A dropdown menu: a list of actions or options behind a button. Arrow keys move through its items, typing jumps
 * to one, Enter or a click runs it, and Escape closes the menu and returns focus to the trigger. */
function DropdownMenu(props: MenuPrimitive.Root.Props): ReactElement {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal(props: MenuPrimitive.Portal.Props): ReactElement {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

/** The button that opens the menu. Render it as a Button, as in `render={<Button variant="outline" />}`. */
function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props): ReactElement {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

/** The menu's popup, in a portal, on the trigger's `side` (`bottom` by default), at least as wide as the trigger. */
function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = sideGap,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >): ReactElement {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 transition duration-100 outline-none data-closed:overflow-hidden data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

/** Items that belong together, named by a DropdownMenuLabel inside it. */
function DropdownMenuGroup(props: MenuPrimitive.Group.Props): ReactElement {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

/** A group's heading, inside its DropdownMenuGroup. `inset` lines it up with items that have an icon. */
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & { readonly inset?: boolean }): ReactElement {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-[inset=true]:pl-7",
        className,
      )}
      {...props}
    />
  );
}

/** An action. `variant="destructive"` marks one that deletes or cannot be undone; `inset` lines it up with items that
 * have an icon. */
function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  readonly inset?: boolean;
  readonly variant?: "default" | "destructive";
}): ReactElement {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex min-h-target min-w-target cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-[inset=true]:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive-subtle data-[variant=destructive]:focus:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

/** Holds a submenu: a DropdownMenuSubTrigger and its DropdownMenuSubContent. */
function DropdownMenuSub(props: MenuPrimitive.SubmenuRoot.Props): ReactElement {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

/** The item that opens a submenu, on hover, a click, Enter or the right arrow key. */
function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & { readonly inset?: boolean }): ReactElement {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex min-h-target min-w-target cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-[inset=true]:pl-7 data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

/** The submenu's popup, beside its trigger. */
function DropdownMenuSubContent({
  align = "start",
  alignOffset = submenuShift,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: ComponentProps<typeof DropdownMenuContent>): ReactElement {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("w-auto min-w-24", className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

/** An option that is on or off, with a check at its end when on. */
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & { readonly inset?: boolean }): ReactElement {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-target min-w-target cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[inset=true]:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

/** Options of which one is chosen, each a DropdownMenuRadioItem. */
function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props): ReactElement {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

/** One option of a DropdownMenuRadioGroup, with a check at its end when chosen. */
function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & { readonly inset?: boolean }): ReactElement {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex min-h-target min-w-target cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-[inset=true]:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props): ReactElement {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

/** An item's keyboard shortcut, at its end. It only shows the shortcut; the app binds the keys. */
function DropdownMenuShortcut({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
