/* The saved views' stores: the browser's storage, held to what it reads back, and the API's, read through the same
 * parse; and the canonical JSON that tells whether a page has changed its view. */

import { describe, expect, test, vi } from "vite-plus/test";

import { apiViewStore, browserViewStore, viewListOf } from "#components/saved-views-store.ts";
import { canonical } from "#components/use-saved-views.ts";

/** A storage of its own for each test, as the browser's `localStorage` behaves. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

interface Sort {
  readonly column: string;
}

/** A state the page takes: a sort by one column. */
function parseSort(state: unknown): Sort | undefined {
  return typeof state === "object" &&
    state !== null &&
    "column" in state &&
    typeof state.column === "string"
    ? { column: state.column }
    : undefined;
}

describe(browserViewStore, () => {
  test("saves, changes in place, makes the default, and deletes, under its own key", async () => {
    const storage = memoryStorage();
    const store = browserViewStore({ key: "positions.grid", parse: parseSort, storage });
    await store.put({ id: "a", name: "By fund", state: { column: "fund" } });
    await store.put({ id: "b", name: "By book", state: { column: "book" } });
    await store.put({ id: "a", name: "By fund, renamed", state: { column: "fund" } });
    await store.setDefault("b");
    expect(await store.list()).toStrictEqual({
      defaultId: "b",
      views: [
        { id: "a", name: "By fund, renamed", state: { column: "fund" } },
        { id: "b", name: "By book", state: { column: "book" } },
      ],
    });
    expect(storage.key(0)).toBe("basis-ui-views:positions.grid");
    await store.remove("b");
    expect(await store.list()).toStrictEqual({
      defaultId: null,
      views: [{ id: "a", name: "By fund, renamed", state: { column: "fund" } }],
    });
  });

  test("reads nothing from a key that holds no JSON, rather than failing the page", async () => {
    const storage = memoryStorage();
    storage.setItem("basis-ui-views:positions.grid", "{not json");
    const store = browserViewStore({ key: "positions.grid", parse: parseSort, storage });
    expect(await store.list()).toStrictEqual({ defaultId: null, views: [] });
  });
});

describe(viewListOf, () => {
  test("drops a view whose state the page no longer takes, and a default that names no view", () => {
    expect(
      viewListOf(
        {
          defaultId: "old",
          views: [
            { id: "old", name: "Old", state: { sortBy: "fund" } },
            { id: "new", name: "New", state: { column: "fund" } },
            { id: 3, name: "No id" },
          ],
        },
        parseSort,
      ),
    ).toStrictEqual({
      defaultId: null,
      views: [{ id: "new", name: "New", state: { column: "fund" } }],
    });
  });
});

describe(apiViewStore, () => {
  test("calls the app's API for each operation and reads its list through parse", async () => {
    const calls = {
      list: vi.fn(async () =>
        Promise.resolve({
          defaultId: "a",
          views: [{ id: "a", name: "A", state: { column: "fund" } }],
        }),
      ),
      put: vi.fn(async () => Promise.resolve({ status: 204 })),
      remove: vi.fn(async () => Promise.resolve({ status: 204 })),
      setDefault: vi.fn(async () => Promise.resolve({ status: 204 })),
    };
    const store = apiViewStore({ calls, key: "positions.grid", parse: parseSort });
    expect(await store.list()).toStrictEqual({
      defaultId: "a",
      views: [{ id: "a", name: "A", state: { column: "fund" } }],
    });
    const view = { id: "b", name: "B", state: { column: "book" } };
    await store.put(view);
    await store.remove("a");
    await store.setDefault(null);
    expect(calls.put).toHaveBeenCalledWith(view);
    expect(calls.remove).toHaveBeenCalledWith("a");
    expect(calls.setDefault).toHaveBeenCalledWith(null);
  });

  test("rejects with the API's error, for SavedViews to show", async () => {
    const failure = new Error("503");
    const store = apiViewStore({
      calls: {
        list: async () => Promise.resolve({ defaultId: null, views: [] }),
        put: async () => Promise.reject(failure),
        remove: async () => Promise.resolve({ status: 204 }),
        setDefault: async () => Promise.resolve({ status: 204 }),
      },
      key: "positions.grid",
      parse: parseSort,
    });
    await expect(store.put({ id: "a", name: "A", state: { column: "fund" } })).rejects.toBe(
      failure,
    );
  });
});

describe(canonical, () => {
  test("is the same for two states whose keys differ only in order", () => {
    expect(canonical({ book: 1, view: { sort: [2, { desc: 3, id: 4 }] } })).toBe(
      canonical({ view: { sort: [2, { id: 4, desc: 3 }] }, book: 1 }),
    );
  });
});
