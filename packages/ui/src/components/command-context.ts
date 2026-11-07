/* What Command shares with its parts: the search, how an item matches it, how many items it shows, and where
 * CommandEmpty goes. command.tsx describes the component. */

import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { createContext, use, useCallback, useState } from "react";

interface CommandContextValue {
  /** Counts one more item shown, and returns the function that uncounts it. */
  readonly addResult: () => () => void;
  /** The command menu's accessible name, which its input and list take unless given their own. */
  readonly label: string;
  /** Whether an item with this value and these keywords matches the search. */
  readonly matches: (value: string, keywords: readonly string[]) => boolean;
  /** What the user has typed. */
  readonly search: string;
}

const CommandContext = createContext<CommandContextValue | null>(null);

/** How many items the search shows. Only CommandEmpty reads it, so a change re-renders nothing else. */
const CommandResultCount = createContext(0);

/** The element CommandList keeps beside its listbox for CommandEmpty, or null outside a CommandList. */
const CommandEmptySlot = createContext<HTMLElement | null>(null);

function useCommand(part: string): CommandContextValue {
  const context = use(CommandContext);
  if (context === null) {
    throw new Error(`A ${part} must be inside a Command.`);
  }
  return context;
}

/** Whether an item matches `search`: always when `shouldFilter` is false or the search is blank, and otherwise when
 * its value or a keyword contains the search, compared by Base UI's filter, which follows the locale and ignores case,
 * accents and punctuation. */
function useMatches(search: string, shouldFilter: boolean): CommandContextValue["matches"] {
  const { contains } = AutocompletePrimitive.useFilter();
  const query = search.trim();
  return useCallback(
    (value: string, keywords: readonly string[]) =>
      !shouldFilter ||
      query === "" ||
      contains(value, query) ||
      keywords.some((keyword) => contains(keyword, query)),
    [contains, query, shouldFilter],
  );
}

/** What the user has typed, and the handler for Base UI's changes to it. Running an item writes the item's value into
 * the input, as an autocomplete does; a command menu ignores that change and keeps the search. */
function useSearch(): readonly [
  string,
  (next: string, details: AutocompletePrimitive.Root.ChangeEventDetails) => void,
] {
  const [search, setSearch] = useState("");
  const changeSearch = useCallback(
    (next: string, details: AutocompletePrimitive.Root.ChangeEventDetails): void => {
      if (details.reason !== "item-press") {
        setSearch(next);
      }
    },
    [],
  );
  return [search, changeSearch];
}

/** The number of items shown, and the function each shown item counts itself with. */
function useResultCount(): readonly [number, CommandContextValue["addResult"]] {
  const [count, setCount] = useState(0);
  const addResult = useCallback((): (() => void) => {
    setCount((current) => current + 1);
    return (): void => {
      setCount((current) => current - 1);
    };
  }, []);
  return [count, addResult];
}

export {
  CommandContext,
  CommandEmptySlot,
  CommandResultCount,
  useCommand,
  useMatches,
  useResultCount,
  useSearch,
};
export type { CommandContextValue };
