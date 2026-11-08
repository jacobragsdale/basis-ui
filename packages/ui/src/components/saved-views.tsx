/* Saved views: the page's filters and other search parameters, kept under a name in this browser, to come back to in
 * one click. */

import { useState } from "react";
import type { ReactElement } from "react";

import { PinIcon } from "#vendor/lucide/pin.tsx";

import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";
import { Input } from "./input.tsx";
import { readViews, writeViews } from "./saved-views-store.ts";
import type { SavedView } from "./saved-views-store.ts";
import { useSearchState } from "./search-state.ts";

/** The views saved for this page, and functions that change them. */
function useSavedViews(path: string): {
  readonly views: readonly SavedView[];
  readonly save: (view: SavedView) => void;
  readonly remove: (name: string) => void;
} {
  const [views, setViews] = useState(() => readViews(path));
  const store = (next: readonly SavedView[]): void => {
    writeViews(path, next);
    setViews(next);
  };
  return {
    remove: (name) => {
      store(views.filter((view) => view.name !== name));
    },
    save: (view) => {
      store([...views.filter(({ name }) => name !== view.name), view]);
    },
    views,
  };
}

/** The name of a view to save, and its Save button. */
function SaveForm({ onSave }: { readonly onSave: (name: string) => void }): ReactElement {
  const [name, setName] = useState("");
  return (
    <div className="flex gap-2 p-1">
      <Input
        aria-label="View name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
      />
      <Button
        disabled={name.trim() === ""}
        onClick={() => {
          onSave(name.trim());
          setName("");
        }}
      >
        Save
      </Button>
    </div>
  );
}

/** A menu of the page's saved views: each one applies its filters, a name and Save keep the current ones, and each
 * saved view can be deleted. Views are kept in this browser, for this page's path.
 *
 * @example
 * ```tsx
 * import { FilterBar, SavedViews } from "@basis/ui";
 *
 * <>
 *   <FilterBar filters={[{ label: "Book", name: "book", options: ["Rates", "Credit"] }]} />
 *   <SavedViews />
 * </>;
 * ```
 */
function SavedViews(): ReactElement {
  const { path, search, setSearch } = useSearchState();
  const { views, save, remove } = useSavedViews(path);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <PinIcon data-icon="inline-start" />
        Views
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          {views.map((view) => (
            <DropdownMenuItem
              key={view.name}
              onClick={() => {
                setSearch(view.search);
              }}
            >
              {view.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <SaveForm
          onSave={(name) => {
            save({ name, search });
          }}
        />
        {views.length === 0 ? null : (
          <DropdownMenuGroup>
            <DropdownMenuSeparator />
            {views.map((view) => (
              <DropdownMenuItem
                key={view.name}
                variant="destructive"
                onClick={() => {
                  remove(view.name);
                }}
              >
                Delete {view.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { SavedViews };
