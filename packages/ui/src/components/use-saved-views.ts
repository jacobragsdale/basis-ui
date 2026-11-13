/* The state behind `SavedViews`: a store's views, loaded through TanStack Query under the store's key, the one the
 * page shows, whether the page has changed it since, and the operations, each a mutation that loads the list again
 * when it lands. A failed one raises `BasisApp`'s error toast, as every failed mutation does, and leaves the list as
 * the store last gave it. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { SavedView, SavedViewList, SavedViewStore } from "./saved-views-store.ts";

interface SavedViewsOptions<TState> {
  /** Where the views live: `browserViewStore` for this browser alone, or `apiViewStore` over the app's API. */
  readonly store: SavedViewStore<TState>;
  /** The page's state now, which a view saves. */
  readonly state: TState;
  /** Puts a view's state on the page. */
  readonly onApply: (state: TState) => void;
  /** Whether the default view, if there is one, is applied once the views load; true unless set. A page opened from a
   * link that names its own state passes false. It is not applied if the page's state has changed since it opened, so
   * views that load late never overwrite what the user has done. */
  readonly applyDefault?: boolean | undefined;
}

interface SavedViewsModel<TState> {
  readonly views: readonly SavedView<TState>[];
  readonly defaultId: string | null;
  /** Whether the views could not be loaded, which the menu says rather than that there are none. */
  readonly failed: boolean;
  /** The view the page shows, or `null` for none. */
  readonly active: SavedView<TState> | null;
  /** Whether the page's state differs from the active view's. */
  readonly edited: boolean;
  readonly onApply: (id: string) => void;
  readonly onSaveAs: (name: string) => void;
  readonly onUpdate: () => void;
  readonly onRename: (name: string) => void;
  readonly onRemove: () => void;
  readonly onSetDefault: (isDefault: boolean) => void;
}

/** JSON with every object's keys in order, so two states that differ only in key order are the same view. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) =>
    typeof part === "object" && part !== null && !Array.isArray(part)
      ? Object.fromEntries(
          Object.entries(part).toSorted(([first], [second]) => first.localeCompare(second)),
        )
      : part,
  );
}

const empty = { defaultId: null, views: [] } as const;

/** One change to the store, and the view it leaves shown: its id, `null` for none, or `undefined` to keep the one
 * shown. */
interface Change {
  readonly run: () => Promise<void>;
  readonly shows?: string | null | undefined;
}

/** The store's list, whether loading it failed, and a mutation that runs a change on it, then loads it again and
 * shows the view it names. */
function useViewList<TState>(
  store: SavedViewStore<TState>,
  show: (id: string | null) => void,
): readonly [SavedViewList<TState> | undefined, boolean, (change: Change) => void] {
  const client = useQueryClient();
  const queryKey = ["@basis/ui", "saved-views", store.key];
  const { data, isError } = useQuery({ queryFn: store.list, queryKey });
  const { mutate } = useMutation({
    mutationFn: async (change: Change) => change.run(),
    onSettled: async () => client.invalidateQueries({ queryKey }),
    onSuccess: (_result, change) => {
      if (change.shows !== undefined) {
        show(change.shows);
      }
    },
  });
  return [data, isError, mutate];
}

/** The view the page opened on, decided once, when the views first load: the default, if the page applies it and
 * its state is still the one it opened with, so a list that arrives late never overwrites what the user has changed;
 * otherwise none. The default is applied once it is decided. */
function useOpeningView<TState>(
  list: SavedViewList<TState> | undefined,
  {
    applyDefault,
    onApply,
    state,
  }: {
    readonly applyDefault: boolean;
    readonly onApply: (state: TState) => void;
    readonly state: TState;
  },
): string | null | undefined {
  // The state the page opened with, and once the views load, the view it opens on.
  const [held, setHeld] = useState<{
    readonly opened: string;
    readonly opening?: { readonly view: SavedView<TState> | null };
  }>(() => ({ opened: canonical(state) }));
  const { opening } = held;
  if (opening === undefined && list !== undefined) {
    const chosen = list.views.find((view) => view.id === list.defaultId) ?? null;
    const untouched = canonical(state) === held.opened;
    setHeld({ ...held, opening: { view: applyDefault && untouched ? chosen : null } });
  }
  const applied = useRef(false);
  useEffect(() => {
    if (opening === undefined || applied.current) {
      return;
    }
    applied.current = true;
    if (opening.view !== null) {
      onApply(opening.view.state);
    }
  }, [opening, onApply]);
  return opening === undefined ? undefined : (opening.view?.id ?? null);
}

/** The store's list and the view shown, which is held: the one opened on until the user picks or saves another,
 * never read from the store's default as it is now, which another tab may have changed. */
function useShownView<TState>({
  store,
  state,
  onApply,
  applyDefault,
}: SavedViewsOptions<TState> & { readonly applyDefault: boolean }): {
  readonly list: SavedViewList<TState>;
  readonly failed: boolean;
  readonly change: (change: Change) => void;
  readonly active: SavedView<TState> | null;
  readonly setPicked: (id: string | null) => void;
} {
  const [picked, setPicked] = useState<string | null | undefined>();
  const [list = empty, failed, change] = useViewList(store, setPicked);
  const opening = useOpeningView(list === empty ? undefined : list, {
    applyDefault,
    onApply,
    state,
  });
  const shown = picked === undefined ? (opening ?? null) : picked;
  const active = list.views.find((view) => view.id === shown) ?? null;
  return { active, change, failed, list, setPicked };
}

/** The saved views of one part of a page, such as its grid, from `store`. */
function useSavedViews<TState>({
  store,
  state,
  onApply,
  applyDefault = true,
}: SavedViewsOptions<TState>): SavedViewsModel<TState> {
  const shown = useShownView({ applyDefault, onApply, state, store });
  const { list, failed, change, active, setPicked } = shown;
  const onActive = (
    run: (view: SavedView<TState>) => Promise<void>,
    shows?: string | null,
  ): void => {
    if (active !== null) {
      change({ run: async () => run(active), shows });
    }
  };
  return {
    active,
    defaultId: list.defaultId,
    failed,
    edited: active !== null && canonical(active.state) !== canonical(state),
    onApply: (id) => {
      const view = list.views.find((saved) => saved.id === id);
      if (view !== undefined) {
        setPicked(id);
        onApply(view.state);
      }
    },
    onRemove: () => {
      onActive(async (view) => store.remove(view.id), null);
    },
    onRename: (name) => {
      onActive(async (view) => store.put({ ...view, name }));
    },
    onSaveAs: (name) => {
      const view = { id: globalThis.crypto.randomUUID(), name, state };
      change({ run: async () => store.put(view), shows: view.id });
    },
    onSetDefault: (isDefault) => {
      onActive(async (view) => store.setDefault(isDefault ? view.id : null));
    },
    onUpdate: () => {
      onActive(async (view) => store.put({ ...view, state }));
    },
    views: list.views,
  };
}

export { canonical, useSavedViews };
export type { SavedViewsModel, SavedViewsOptions };
