/* Kbd and KbdGroup, from shadcn's Base UI source: a key, or a combination of keys, as the keyboard shows it. Inside a
 * tooltip it inverts to sit on the tooltip's surface; shadcn's dark-mode tint for that case is dropped, since the
 * tooltip's tokens already switch with the mode. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

/** A key, such as `Ctrl` or `K`, in a `<kbd>` element. An icon inside it is sized to the key.
 *
 * @use For a key or keys in text or a tooltip, such as Ctrl+K. A menu item's shortcut is its menu's own part, such as
 * DropdownMenuShortcut.
 * @see Tooltip, DropdownMenuShortcut, CommandShortcut, useShortcut
 *
 * @example
 * ```tsx
 * import { Kbd, KbdGroup } from "@basis/ui";
 *
 * <KbdGroup>
 *   <Kbd>Ctrl</Kbd>
 *   <Kbd>K</Kbd>
 * </KbdGroup>;
 * ```
 */
function Kbd({ className, ...props }: ComponentProps<"kbd">): ReactElement {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none in-data-[slot=tooltip-content]:bg-muted-foreground in-data-[slot=tooltip-content]:text-background [&_svg:not([class*='size-'])]:size-(--control-xs-icon)",
        className,
      )}
      {...props}
    />
  );
}

/** Keys pressed together, such as `Ctrl` `K`: a `<kbd>` holding a Kbd for each key, as HTML nests them. */
function KbdGroup({ className, ...props }: ComponentProps<"kbd">): ReactElement {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
