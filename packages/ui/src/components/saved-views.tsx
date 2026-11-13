/* Saved views: a menu button that names the view a page shows, lists its saved views to apply one, and saves the
 * page's state as a new view, saves changes to the one shown, renames it, makes it the default or deletes it. The
 * views live in a store (saved-views-store.ts): the browser's storage, or the app's API. It serves a grid's, a
 * pivot's or a chart's layout, and a `DataTable`'s state with its filter bar's values, in the bar's `actions`. */

import { useState } from "react";
import type { ReactElement } from "react";

import { ChevronDownIcon } from "#vendor/lucide/chevron-down.tsx";

import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";
import { DeleteViewDialog, ViewNameDialog } from "./saved-views-dialogs.tsx";
import { useSavedViews } from "./use-saved-views.ts";
import type { SavedView } from "./saved-views-store.ts";
import type { SavedViewsModel, SavedViewsOptions } from "./use-saved-views.ts";

interface SavedViewsProps<TState> extends SavedViewsOptions<TState> {
  /** What the views are of, which names the menu, such as "Grid views"; "Views" unless set. */
  readonly label?: string | undefined;
}

type Opened = "save" | "rename" | "delete" | null;

/** The trigger's text: the view shown, marked when the page has changed it, or the menu's label. */
function triggerText<TState>(model: SavedViewsModel<TState>, label: string): string {
  if (model.active === null) {
    return label;
  }
  return model.edited ? `${model.active.name} (changed)` : model.active.name;
}

/** The saved views, the one shown checked and the default marked. */
function ViewList<TState>({ model }: { readonly model: SavedViewsModel<TState> }): ReactElement {
  if (model.views.length === 0) {
    return (
      <DropdownMenuLabel>
        {model.failed ? "The saved views could not be loaded." : "No saved views yet"}
      </DropdownMenuLabel>
    );
  }
  return (
    <DropdownMenuRadioGroup
      value={model.active?.id ?? ""}
      onValueChange={(id: unknown) => {
        if (typeof id === "string") {
          model.onApply(id);
        }
      }}
    >
      {model.views.map((view) => (
        <DropdownMenuRadioItem key={view.id} value={view.id}>
          {view.name}
          {view.id === model.defaultId ? (
            <DropdownMenuShortcut>Default</DropdownMenuShortcut>
          ) : null}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/** What can be done to the view shown. */
function ActiveViewActions<TState>({
  model,
  active,
  open,
}: {
  readonly model: SavedViewsModel<TState>;
  readonly active: SavedView<TState>;
  readonly open: (dialog: Opened) => void;
}): ReactElement {
  const isDefault = active.id === model.defaultId;
  return (
    <>
      <DropdownMenuItem
        disabled={!model.edited}
        onClick={() => {
          model.onUpdate();
        }}
      >
        Save changes to {active.name}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          open("rename");
        }}
      >
        Rename {active.name}…
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          model.onSetDefault(!isDefault);
        }}
      >
        {isDefault ? `Stop opening ${active.name} by default` : `Open ${active.name} by default`}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onClick={() => {
          open("delete");
        }}
      >
        Delete {active.name}…
      </DropdownMenuItem>
    </>
  );
}

/** Saving the page's state as a new view, and what can be done to the view shown, if any. */
function ViewActions<TState>({
  model,
  open,
}: {
  readonly model: SavedViewsModel<TState>;
  readonly open: (dialog: Opened) => void;
}): ReactElement {
  return (
    <DropdownMenuGroup>
      <DropdownMenuItem
        onClick={() => {
          open("save");
        }}
      >
        Save as a new view…
      </DropdownMenuItem>
      {model.active === null ? null : (
        <ActiveViewActions model={model} active={model.active} open={open} />
      )}
    </DropdownMenuGroup>
  );
}

/** The dialogs that name a view, to save a new one or rename the one shown. */
function NameDialogs<TState>({
  model,
  opened,
  open,
}: {
  readonly model: SavedViewsModel<TState>;
  readonly opened: Opened;
  readonly open: (dialog: Opened) => void;
}): ReactElement {
  const close = (isOpen: boolean): void => {
    if (!isOpen) {
      open(null);
    }
  };
  const name = model.active?.name ?? "";
  return (
    <>
      <ViewNameDialog
        open={opened === "save"}
        onOpenChange={close}
        title="Save as a new view"
        description="The view keeps what the page shows now, to open again from this menu."
        initial=""
        confirm="Save view"
        onConfirm={(text) => {
          model.onSaveAs(text);
          open(null);
        }}
      />
      <ViewNameDialog
        open={opened === "rename"}
        onOpenChange={close}
        title={`Rename ${name}`}
        description="The view keeps what it shows; only its name changes."
        initial={name}
        confirm="Rename"
        onConfirm={(text) => {
          model.onRename(text);
          open(null);
        }}
      />
    </>
  );
}

/**
 * A menu of a page's saved views: apply one, save the page's state as a new one, or save changes to, rename, make the
 * default or delete the one shown. Give it the store, the page's state and `onApply`, which puts a view's state on
 * the page; the default view is applied once the views load, unless `applyDefault` is false.
 *
 * @use For views a user saves of a grid's, a pivot's or a chart's layout, or of a table's sort and filters.
 * @see browserViewStore, apiViewStore, FilterBar, DataTable
 * @example
 * ```tsx
 * import { SavedViews, browserViewStore } from "@basis/ui";
 * import { useState } from "react";
 * import { z } from "zod";
 *
 * // Once, outside any component: what a view holds, and where the views live.
 * const viewSchema = z.object({ sortBy: z.enum(["issuer", "par"]) });
 * type PositionsView = z.infer<typeof viewSchema>;
 * const store = browserViewStore({
 *   key: "positions.table",
 *   parse: (state) => viewSchema.safeParse(state).data,
 * });
 *
 * // In the page's component: the page's state, which a view saves and restores.
 * const [view, setView] = useState<PositionsView>({ sortBy: "issuer" });
 *
 * <SavedViews label="Position views" store={store} state={view} onApply={setView} />;
 * ```
 */
function SavedViews<TState>({
  label = "Views",
  ...options
}: SavedViewsProps<TState>): ReactElement {
  const model = useSavedViews(options);
  const [opened, setOpened] = useState<Opened>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <span>{triggerText(model, label)}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <ViewList model={model} />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <ViewActions model={model} open={setOpened} />
        </DropdownMenuContent>
      </DropdownMenu>
      <NameDialogs model={model} opened={opened} open={setOpened} />
      <DeleteViewDialog
        open={opened === "delete"}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setOpened(null);
          }
        }}
        name={model.active?.name ?? ""}
        onConfirm={() => {
          model.onRemove();
          setOpened(null);
        }}
      />
    </>
  );
}

export { SavedViews };
export type { SavedViewsProps };
