/* Where saved views live: a store with four operations, which `SavedViews` calls, and two adapters, one over the
 * browser's storage and one over an app's API. A view's state is plain JSON, such as a grid's layout, a pivot's, a
 * chart's, or a table's sorting with its filter bar's values; each adapter reads it back through `parse`, so a view
 * saved by an older page that the state no longer takes is dropped rather than applied. */

/** One saved view: its id, the name the user gave it, and the state it restores. */
interface SavedView<TState> {
  readonly id: string;
  readonly name: string;
  readonly state: TState;
}

/** Every saved view, in the order saved, and the one that opens by default, if any. */
interface SavedViewList<TState> {
  readonly views: readonly SavedView<TState>[];
  readonly defaultId: string | null;
}

/** What `SavedViews` needs of a store: a key that names the views it holds, unique in the app, and four operations.
 * `put` saves a view new or changed, by its id. */
interface SavedViewStore<TState> {
  readonly key: string;
  readonly list: () => Promise<SavedViewList<TState>>;
  readonly put: (view: SavedView<TState>) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
  readonly setDefault: (id: string | null) => Promise<void>;
}

/** Reads a view's stored state: the state, or `undefined` for one the page no longer takes. A Zod schema's
 * `(value) => schema.safeParse(value).data` is one. */
type ParseViewState<TState> = (state: unknown) => TState | undefined;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/** The views in `value` whose id, name and state are what a view holds, each state read by `parse`. */
function viewsOf<TState>(
  value: unknown,
  parse: ParseViewState<TState>,
): readonly SavedView<TState>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry: unknown) => {
    if (!isRecord(entry) || typeof entry["id"] !== "string" || typeof entry["name"] !== "string") {
      return [];
    }
    const state = parse(entry["state"]);
    return state === undefined ? [] : [{ id: entry["id"], name: entry["name"], state }];
  });
}

/** A list as a store returns it, from what was stored or what an API sent: its views read by `parse`, and its
 * default kept only if it names one of them. */
function viewListOf<TState>(value: unknown, parse: ParseViewState<TState>): SavedViewList<TState> {
  const views = isRecord(value) ? viewsOf(value["views"], parse) : [];
  const named = isRecord(value) ? value["defaultId"] : null;
  const defaultId =
    views.some((view) => view.id === named) && typeof named === "string" ? named : null;
  return { defaultId, views };
}

interface BrowserViewStoreOptions<TState> {
  /** The storage key, which names the views' page and part, such as `"positions.grid"`; one key holds them all. */
  readonly key: string;
  readonly parse: ParseViewState<TState>;
  /** The storage, `localStorage` unless set, so that a test can pass its own. */
  readonly storage?: Storage | undefined;
}

/** The key's prefix in the browser's storage, so a page's views never meet another key of the app's. */
const keyPrefix = "basis-ui-views:";

/** `work`'s result as a promise, or its error as a rejected one, for a store whose storage answers at once. */
async function settled<TResult>(work: () => TResult): Promise<TResult> {
  try {
    return await Promise.resolve(work());
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/** The list as stored, before `parse` reads it: every entry, a view the page no longer takes among them, and the
 * default as stored, so a write keeps what this page cannot read. */
interface StoredList {
  readonly views: readonly unknown[];
  readonly defaultId: unknown;
}

const nothingStored: StoredList = { defaultId: null, views: [] };

/** A stored entry's id, if it has one. */
function entryId(entry: unknown): string | undefined {
  return isRecord(entry) && typeof entry["id"] === "string" ? entry["id"] : undefined;
}

/** The stored list a write starts from: what is stored, or, for text that is not a list of views, nothing, the text
 * kept aside first under a key of its own, so that no write loses it. */
function storedList(storage: Storage, name: string): StoredList {
  const text = storage.getItem(name);
  if (text === null) {
    return nothingStored;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (isRecord(value) && Array.isArray(value["views"])) {
      return { defaultId: value["defaultId"] ?? null, views: value["views"] };
    }
  } catch {
    // Not JSON: kept aside below.
  }
  storage.setItem(`${name}:unreadable:${String(Date.now())}`, text);
  return nothingStored;
}

/** The stored views with `view` in place of the one with its id, or after them. */
function withView(views: readonly unknown[], view: SavedView<unknown>): readonly unknown[] {
  const index = views.findIndex((entry) => entryId(entry) === view.id);
  return index === -1 ? [...views, view] : views.toSpliced(index, 1, view);
}

/** A store in the browser's storage: the user's views on this browser, which no other user or machine sees. A
 * storage that refuses a write, as a full one does, rejects the operation with its error.
 *
 * A write never stores less than it found: a view the page's `parse` refuses, such as one a newer release saved or
 * another part of the app shares the key with, stays stored, as does a default this page cannot show, and text that
 * is not a list of views is kept aside under `KEY:unreadable:TIME` before the first write replaces it. */
function browserViewStore<TState>({
  key,
  parse,
  storage = globalThis.localStorage,
}: BrowserViewStoreOptions<TState>): SavedViewStore<TState> {
  const name = `${keyPrefix}${key}`;
  const read = (): SavedViewList<TState> => {
    const text = storage.getItem(name);
    if (text === null) {
      return { defaultId: null, views: [] };
    }
    try {
      return viewListOf(JSON.parse(text), parse);
    } catch {
      return { defaultId: null, views: [] };
    }
  };
  const change = (next: (stored: StoredList) => StoredList): void => {
    const stored = storedList(storage, name);
    storage.setItem(name, JSON.stringify(next(stored)));
  };
  return {
    key,
    list: async () => settled(read),
    put: async (view) =>
      settled(() => {
        change((stored) => ({ ...stored, views: withView(stored.views, view) }));
      }),
    remove: async (id) =>
      settled(() => {
        change((stored) => ({
          defaultId: stored.defaultId === id ? null : stored.defaultId,
          views: stored.views.filter((entry) => entryId(entry) !== id),
        }));
      }),
    setDefault: async (id) =>
      settled(() => {
        change((stored) => ({ ...stored, defaultId: id }));
      }),
  };
}

/** The app's calls to its API for a page's views, normally the generated client's. Each may resolve to whatever the
 * client returns; `list` resolves to the list as the API sends it, which the store reads through `parse`. */
interface ApiViewCalls {
  readonly list: () => Promise<unknown>;
  readonly put: (view: SavedView<unknown>) => Promise<unknown>;
  readonly remove: (id: string) => Promise<unknown>;
  readonly setDefault: (id: string | null) => Promise<unknown>;
}

interface ApiViewStoreOptions<TState> {
  /** What names the views, unique in the app, such as `"positions.grid"`. */
  readonly key: string;
  readonly calls: ApiViewCalls;
  readonly parse: ParseViewState<TState>;
}

/** A store over the app's API, which keeps a user's views wherever they sign in. A call that fails rejects the
 * operation with its error, which `BasisApp` shows as a toast, as it does for every failed mutation. */
function apiViewStore<TState>({
  key,
  calls,
  parse,
}: ApiViewStoreOptions<TState>): SavedViewStore<TState> {
  return {
    key,
    list: async () => viewListOf(await calls.list(), parse),
    put: async (view) => {
      await calls.put(view);
    },
    remove: async (id) => {
      await calls.remove(id);
    },
    setDefault: async (id) => {
      await calls.setDefault(id);
    },
  };
}

export { apiViewStore, browserViewStore, viewListOf };
export type {
  ApiViewCalls,
  ApiViewStoreOptions,
  BrowserViewStoreOptions,
  ParseViewState,
  SavedView,
  SavedViewList,
  SavedViewStore,
};
