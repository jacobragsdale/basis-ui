/* CommandItem and CommandShortcut, Command's items, from shadcn's Base UI source (its base-nova style) on Base UI's
 * Autocomplete rather than cmdk; command.tsx describes the component. The item is highlighted through Base UI's
 * `data-highlighted` where cmdk sets `data-selected`, and on `accent`, as a menu's item is, where shadcn uses `muted`:
 * in this theme's dark mode `muted` is the popover's own colour, so the highlight would not show. It drops cmdk's
 * check mark. */

import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { cn } from "cn";
import { isValidElement, useLayoutEffect } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { useCommand } from "./command-context.ts";

const noKeywords: readonly string[] = [];

type ItemClick = NonNullable<AutocompletePrimitive.Item.Props["onClick"]>;

/** An item's keyboard shortcut, at its end. It only shows the shortcut; the app binds the keys. */
function CommandShortcut({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/command-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** The text of an item's children, which is its value when it has no `value` prop. A CommandShortcut's text is left
 * out, so that searching for a letter does not match every item whose shortcut has it. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((child: ReactNode) => textOf(child)).join("");
  }
  if (isValidElement<{ readonly children?: ReactNode }>(node) && node.type !== CommandShortcut) {
    return textOf(node.props.children);
  }
  return "";
}

/** A command. It shows while its `value`, or else its text, or one of its `keywords` matches the search, and always
 * with `forceMount`; Enter or a click runs `onSelect` with its value. */
function CommandItem({
  className,
  children,
  value,
  keywords = noKeywords,
  disabled = false,
  forceMount = false,
  onSelect,
  onClick,
  ...props
}: Omit<AutocompletePrimitive.Item.Props, "onSelect" | "value"> & {
  /** The text the search matches and `onSelect` receives; the item's text, without its CommandShortcut, unless set. */
  readonly value?: string;
  /** More words the item matches, such as `["preferences"]` for Settings. */
  readonly keywords?: readonly string[];
  /** Whether the item shows whatever the search. */
  readonly forceMount?: boolean;
  readonly onSelect?: (value: string) => void;
}): ReactElement | null {
  const { addResult, matches } = useCommand("CommandItem");
  const itemValue = (value ?? textOf(children)).trim();
  const shown = forceMount || matches(itemValue, keywords);
  useLayoutEffect(() => (shown ? addResult() : undefined), [addResult, shown]);
  if (!shown) {
    return null;
  }

  function select(event: Parameters<ItemClick>[0]): void {
    onClick?.(event);
    if (!disabled) {
      onSelect?.(itemValue);
    }
  }

  return (
    <AutocompletePrimitive.Item
      data-slot="command-item"
      value={itemValue}
      disabled={disabled}
      onClick={select}
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=command-dialog-content]:rounded-lg data-disabled:pointer-events-none data-disabled:opacity-disabled data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--control-md-icon) data-highlighted:*:[svg]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  );
}

export { CommandItem, CommandShortcut };
