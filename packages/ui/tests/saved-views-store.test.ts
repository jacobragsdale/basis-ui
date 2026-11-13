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

  test("never writes back less than it read: a view its parse rejects, and the default naming it, stay stored", async () => {
    const storage = memoryStorage();
    const stored = {
      defaultId: "newer",
      views: [
        { id: "newer", name: "From a newer release", state: { columns: ["fund"] } },
        { id: "a", name: "By fund", state: { column: "fund" } },
      ],
    };
    storage.setItem("basis-ui-views:positions.grid", JSON.stringify(stored));
    const store = browserViewStore({ key: "positions.grid", parse: parseSort, storage });
    const shown = await store.list();
    expect(shown.views.map(({ id }) => id)).toStrictEqual(["a"]);
    await store.put({ id: "b", name: "By book", state: { column: "book" } });
    await store.remove("a");
    await store.setDefault(null);
    expect(JSON.parse(storage.getItem("basis-ui-views:positions.grid") ?? "null")).toStrictEqual({
      defaultId: null,
      views: [stored.views[0], { id: "b", name: "By book", state: { column: "book" } }],
    });
  });

  test("a default it cannot show is kept until another is chosen", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "basis-ui-views:positions.grid",
      JSON.stringify({ defaultId: "newer", views: [{ id: "newer", name: "Newer", state: 1 }] }),
    );
    const store = browserViewStore({ key: "positions.grid", parse: parseSort, storage });
    await store.put({ id: "b", name: "By book", state: { column: "book" } });
    expect(JSON.parse(storage.getItem("basis-ui-views:positions.grid") ?? "null")).toMatchObject({
      defaultId: "newer",
    });
  });

  test("keeps text it cannot read aside before it writes over it", async () => {
    const storage = memoryStorage();
    storage.setItem("basis-ui-views:positions.grid", "{not json");
    const store = browserViewStore({ key: "positions.grid", parse: parseSort, storage });
    await store.put({ id: "b", name: "By book", state: { column: "book" } });
    const aside = Array.from({ length: storage.length }, (_unused, index) =>
      storage.key(index),
    ).filter((key) => key?.startsWith("basis-ui-views:positions.grid:unreadable:") === true);
    expect(aside.map((key) => storage.getItem(key ?? ""))).toStrictEqual(["{not json"]);
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
