/* Command and its parts: a search box over a list of commands, which narrows the list as the user types and runs the
 * highlighted command on Enter. shadcn builds it on cmdk; this one is built on Base UI's Autocomplete in its inline
 * mode, the pattern Base UI documents for a command palette, so the package adds no dependency. It keeps shadcn's
 * parts and the props cmdk gives them: CommandItem takes `value`, `keywords`, `disabled`, `forceMount` and
 * `onSelect(value)`, CommandGroup a `heading`, CommandSeparator `alwaysRender`, and Command `label`, `loop` and
 * `shouldFilter`. CommandItem and CommandShortcut are in command-item.tsx, CommandDialog in command-dialog.tsx.
 *
 * How it differs from cmdk:
 * - An item matches when its value, or one of its keywords, contains the search, compared by Base UI's filter. cmdk
 *   scores fuzzy matches and sorts the list by them; here the list keeps its order.
 * - An item's value is its `value` prop, or else the text of its children without its CommandShortcut.
 * - The search cannot be controlled from outside, and Command takes no `value` for the highlighted item.
 *
 * And from shadcn's classes: the search box is an InputGroup as it stands, where base-nova restyles it (a softer
 * outline at 30%, which would fall under the 3:1 contrast the theme holds controls to); the list drops `no-scrollbar`,
 * a utility the theme lacks; and the item drops cmdk's check mark.
 *
 * The parts follow the ARIA combobox pattern: the input is a combobox that owns a listbox, and keeps focus while the
 * arrow keys move a highlight through its options. A listbox may hold only options and their groups, so CommandEmpty,
 * a live region that says when nothing matches, moves out of CommandList's listbox into a slot beside it. */

import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { cn } from "cn";
import { use, useMemo, useState } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";

import { SearchIcon } from "#vendor/lucide/search.tsx";

import {
  CommandContext,
  CommandEmptySlot,
  CommandResultCount,
  useCommand,
  useMatches,
  useResultCount,
  useSearch,
} from "./command-context.ts";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group.tsx";

/** A command menu: a CommandInput over a CommandList of CommandItems. The list narrows as the user types, the arrow
 * keys move the highlight, and Enter or a click runs the highlighted item's `onSelect`. `label` names the menu for
 * assistive technology, and `shouldFilter={false}` shows every item, for a list the app filters itself. */
function Command({
  className,
  label = "Commands",
  shouldFilter = true,
  loop = true,
  ...props
}: ComponentProps<"div"> & {
  readonly label?: string;
  readonly shouldFilter?: boolean;
  /** Whether the arrow keys wrap from the last item through the input to the first: true by default, as in Base UI,
   * where cmdk's is false. */
  readonly loop?: boolean;
}): ReactElement {
  const [search, changeSearch] = useSearch();
  const [resultCount, addResult] = useResultCount();
  const matches = useMatches(search, shouldFilter);
  const context = useMemo(
    () => ({ addResult, label, matches, search }),
    [addResult, label, matches, search],
  );

  return (
    <CommandContext value={context}>
      <CommandResultCount value={resultCount}>
        <AutocompletePrimitive.Root
          open
          inline
          autoHighlight="always"
          keepHighlight
          loopFocus={loop}
          value={search}
          onValueChange={changeSearch}
        >
          <div
            data-slot="command"
            className={cn(
              "flex size-full flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground",
              className,
            )}
            {...props}
          />
        </AutocompletePrimitive.Root>
      </CommandResultCount>
    </CommandContext>
  );
}

/** The search box: a combobox that owns the list, in an InputGroup with a search icon. It takes the Command's `label`
 * as its name unless given an `aria-label`; a placeholder says what to type. */
function CommandInput(
  props: Omit<AutocompletePrimitive.Input.Props, "defaultValue" | "value">,
): ReactElement {
  const { label } = useCommand("CommandInput");
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup>
        <AutocompletePrimitive.Input aria-label={label} render={<InputGroupInput />} {...props} />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

/** The list of items and groups, which scrolls past `max-h-72`. CommandEmpty may sit inside it. */
function CommandList({
  className,
  children,
  ...props
}: AutocompletePrimitive.List.Props): ReactElement {
  const { label } = useCommand("CommandList");
  const [emptySlot, setEmptySlot] = useState<HTMLElement | null>(null);
  return (
    <div
      data-slot="command-list"
      className={cn("max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto", className)}
    >
      <div ref={setEmptySlot} className="contents" />
      <CommandEmptySlot value={emptySlot}>
        <AutocompletePrimitive.List aria-label={label} className="outline-none" {...props}>
          {children}
        </AutocompletePrimitive.List>
      </CommandEmptySlot>
    </div>
  );
}

/** What the list shows when nothing matches the search, which assistive technology announces. */
function CommandEmpty({ className, children, ...props }: ComponentProps<"output">): ReactElement {
  const count = use(CommandResultCount);
  const slot = use(CommandEmptySlot);
  const empty = (
    <output
      data-slot="command-empty"
      aria-live="polite"
      className={cn("block text-center text-sm not-empty:py-6", className)}
      {...props}
    >
      {count === 0 ? children : null}
    </output>
  );
  return slot === null ? empty : createPortal(empty, slot);
}

/** Items under a `heading`, hidden while none of them matches the search. */
function CommandGroup({
  className,
  heading,
  children,
  ...props
}: AutocompletePrimitive.Group.Props & { readonly heading?: ReactNode }): ReactElement {
  return (
    <AutocompletePrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground not-has-data-[slot=command-item]:hidden",
        className,
      )}
      {...props}
    >
      {heading === undefined ? null : (
        <AutocompletePrimitive.GroupLabel
          data-slot="command-group-heading"
          className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
        >
          {heading}
        </AutocompletePrimitive.GroupLabel>
      )}
      {children}
    </AutocompletePrimitive.Group>
  );
}

/** A line between groups, hidden while the user searches unless `alwaysRender` is set. */
function CommandSeparator({
  className,
  alwaysRender = false,
  ...props
}: AutocompletePrimitive.Separator.Props & {
  readonly alwaysRender?: boolean;
}): ReactElement | null {
  const { search } = useCommand("CommandSeparator");
  if (!alwaysRender && search !== "") {
    return null;
  }
  return (
    <AutocompletePrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandSeparator };
