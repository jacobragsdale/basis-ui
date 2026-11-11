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
   * link that names its own state passes false. */
  readonly applyDefault?: boolean | undefined;
}

interface SavedViewsModel<TState> {
  readonly views: readonly SavedView<TState>[];
  readonly defaultId: string | null;
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

/** The store's list and a mutation that runs a change on it, then loads it again and shows the view it names. */
function useViewList<TState>(
  store: SavedViewStore<TState>,
  show: (id: string | null) => void,
): readonly [SavedViewList<TState> | undefined, (change: Change) => void] {
  const client = useQueryClient();
  const queryKey = ["@basis/ui", "saved-views", store.key];
  const { data } = useQuery({ queryFn: store.list, queryKey });
  const { mutate } = useMutation({
    mutationFn: async (change: Change) => change.run(),
    onSettled: async () => client.invalidateQueries({ queryKey }),
    onSuccess: (_result, change) => {
      if (change.shows !== undefined) {
        show(change.shows);
      }
    },
  });
  return [data, mutate];
}

/** Applies the default view once, when the views first load, unless the page says not to. */
function useDefaultView<TState>(
  list: SavedViewList<TState> | undefined,
  applyDefault: boolean,
  onApply: (state: TState) => void,
): void {
  const applied = useRef(false);
  useEffect(() => {
    if (list === undefined || applied.current) {
      return;
    }
    applied.current = true;
    const chosen = list.views.find((view) => view.id === list.defaultId);
    if (applyDefault && chosen !== undefined) {
      onApply(chosen.state);
    }
  }, [applyDefault, list, onApply]);
}

/** The id of the view shown: the one picked or saved, or before the user has done either, the default if it was
 * applied. */
function shownId(
  picked: string | null | undefined,
  applyDefault: boolean,
  { defaultId }: SavedViewList<unknown>,
): string | null {
  if (picked === undefined) {
    return applyDefault ? defaultId : null;
  }
  return picked;
}

/** The saved views of one part of a page, such as its grid, from `store`. */
function useSavedViews<TState>({
  store,
  state,
  onApply,
  applyDefault = true,
}: SavedViewsOptions<TState>): SavedViewsModel<TState> {
  const [picked, setPicked] = useState<string | null | undefined>();
  const [list = empty, change] = useViewList(store, setPicked);
  useDefaultView(list === empty ? undefined : list, applyDefault, onApply);
  const active = list.views.find((view) => view.id === shownId(picked, applyDefault, list)) ?? null;
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
