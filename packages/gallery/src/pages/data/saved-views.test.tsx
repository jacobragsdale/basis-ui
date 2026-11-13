import "#styles.css";

import { SavedViews, browserViewStore } from "@basis/ui";
import type { SavedViewList, SavedViewStore } from "@basis/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { WithQueryClient } from "./with-query-client.tsx";

interface Sort {
  readonly by: string;
}

function parseSort(state: unknown): Sort | undefined {
  return typeof state === "object" &&
    state !== null &&
    "by" in state &&
    typeof state.by === "string"
    ? { by: state.by }
    : undefined;
}

/** A store of its own for each test, in a storage of its own, seeded with `json` when given. */
function storeWith(json?: string): ReturnType<typeof browserViewStore<Sort>> {
  const key = `test.${String(Math.random())}`;
  if (json !== undefined) {
    localStorage.setItem(`basis-ui-views:${key}`, json);
  }
  return browserViewStore({ key, parse: parseSort });
}

/** The sort page's parts. */
function SortParts({ store }: { readonly store: SavedViewStore<Sort> }): ReactElement {
  const [sort, setSort] = useState<Sort>({ by: "issuer" });
  return (
    <>
      <p>Sorted by {sort.by}</p>
      <button
        type="button"
        onClick={() => {
          setSort({ by: "par" });
        }}
      >
        Sort by par
      </button>
      <SavedViews label="Views" store={store} state={sort} onApply={setSort} />
    </>
  );
}

/** A page whose state is a sort, shown as text, with its views and a button that changes it. */
function SortPage({ store }: { readonly store: SavedViewStore<Sort> }): ReactElement {
  return (
    <WithQueryClient>
      <SortParts store={store} />
    </WithQueryClient>
  );
}

/** The sort page under the test's own query client, which it can tell to load the views again, as a window's
 * focus would. */
function SortPageIn({
  client,
  store,
}: {
  readonly client: QueryClient;
  readonly store: SavedViewStore<Sort>;
}): ReactElement {
  return (
    <QueryClientProvider client={client}>
      <SortParts store={store} />
    </QueryClientProvider>
  );
}

/** A query client that never retries, so a failed load shows at once. */
function testClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** A store over `list`, which the test resolves or rejects when it likes, as an API behind retries answers. */
function heldStore(list: Promise<SavedViewList<Sort>>): SavedViewStore<Sort> {
  return {
    key: `held.${String(Math.random())}`,
    list: async () => list,
    put: async () => Promise.resolve(),
    remove: async () => Promise.resolve(),
    setDefault: async () => Promise.resolve(),
  };
}

const seeded = JSON.stringify({
  defaultId: "fund",
  views: [
    { id: "book", name: "By book", state: { by: "book" } },
    { id: "fund", name: "By fund", state: { by: "fund" } },
  ],
});

describe("SavedViews", () => {
  test("applies the default view once the views load, and names it", async () => {
    const screen = await render(<SortPage store={storeWith(seeded)} />);
    await expect.element(screen.getByText("Sorted by fund")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "By fund" })).toBeVisible();
  });

  test("applies a view picked from the menu", async () => {
    const screen = await render(<SortPage store={storeWith(seeded)} />);
    await screen.getByRole("button", { name: "By fund" }).click();
    await page.getByRole("menuitemradio", { name: "By book" }).click();
    await expect.element(screen.getByText("Sorted by book")).toBeVisible();
  });

  test("says when the page has changed the view, and saves the change to it", async () => {
    const store = storeWith(seeded);
    const screen = await render(<SortPage store={store} />);
    await expect.element(screen.getByText("Sorted by fund")).toBeVisible();
    await screen.getByRole("button", { name: "Sort by par" }).click();
    await screen.getByRole("button", { name: "By fund (changed)" }).click();
    await page.getByRole("menuitem", { name: "Save changes to By fund" }).click();
    await expect
      .element(screen.getByRole("button", { name: "By fund", exact: true }))
      .toBeVisible();
    const { views } = await store.list();
    expect(views[1]?.state).toStrictEqual({ by: "par" });
  });

  test("saves the page's state as a new view by the name given, and shows it", async () => {
    const store = storeWith();
    const screen = await render(<SortPage store={store} />);
    await screen.getByRole("button", { name: "Views" }).click();
    await expect.element(page.getByText("No saved views yet")).toBeVisible();
    await page.getByRole("menuitem", { name: "Save as a new view…" }).click();
    await page.getByLabelText("Name").fill("Issuers");
    await page.getByRole("button", { name: "Save view" }).click();
    await expect.element(screen.getByRole("button", { name: "Issuers" })).toBeVisible();
    const { views } = await store.list();
    expect(views.map((view) => view.name)).toStrictEqual(["Issuers"]);
  });

  test("stops opening the view shown by default, and still names it as the view shown", async () => {
    const store = storeWith(seeded);
    const screen = await render(<SortPage store={store} />);
    await screen.getByRole("button", { name: "By fund" }).click();
    await page.getByRole("menuitem", { name: "Stop opening By fund by default" }).click();
    await expect
      .poll(async () => {
        const list = await store.list();
        return list.defaultId;
      })
      .toBeNull();
    await screen.getByRole("button", { name: "By fund", exact: true }).click();
    await expect.element(page.getByRole("menuitem", { name: "Delete By fund…" })).toBeVisible();
  });

  test("a default another tab sets is not taken for the view shown when the views load again", async () => {
    const store = storeWith(JSON.stringify({ ...JSON.parse(seeded), defaultId: null }));
    const client = testClient();
    const screen = await render(<SortPageIn client={client} store={store} />);
    await expect.element(screen.getByRole("button", { name: "Views" })).toBeVisible();
    // Another tab makes By book the default, in the storage both share.
    await store.setDefault("book");
    globalThis.dispatchEvent(new StorageEvent("storage", { key: `basis-ui-views:${store.key}` }));
    await client.invalidateQueries();
    await expect.element(screen.getByRole("button", { name: "Views" })).toBeVisible();
    await expect.element(screen.getByText("Sorted by issuer")).toBeVisible();
  });

  test("a list that loads after the user has changed the page does not apply the default over it", async () => {
    const { promise, resolve } = Promise.withResolvers<SavedViewList<Sort>>();
    const screen = await render(<SortPageIn client={testClient()} store={heldStore(promise)} />);
    await screen.getByRole("button", { name: "Sort by par" }).click();
    resolve({ defaultId: "fund", views: [{ id: "fund", name: "By fund", state: { by: "fund" } }] });
    await screen.getByRole("button", { name: "Views" }).click();
    await expect
      .element(page.getByRole("menuitemradio", { name: "By fund Default" }))
      .toBeVisible();
    await expect.element(screen.getByText("Sorted by par")).toBeVisible();
  });

  test("says when the views could not be loaded, not that there are none", async () => {
    const screen = await render(
      <SortPageIn client={testClient()} store={heldStore(Promise.reject(new Error("503")))} />,
    );
    await screen.getByRole("button", { name: "Views" }).click();
    await expect.element(page.getByText("The saved views could not be loaded.")).toBeVisible();
  });

  test("deletes the view shown after asking", async () => {
    const store = storeWith(seeded);
    const screen = await render(<SortPage store={store} />);
    await screen.getByRole("button", { name: "By fund" }).click();
    await page.getByRole("menuitem", { name: "Delete By fund…" }).click();
    await page.getByRole("button", { name: "Delete view" }).click();
    await expect.element(screen.getByRole("button", { name: "Views" })).toBeVisible();
    const { views } = await store.list();
    expect(views.map((view) => view.name)).toStrictEqual(["By book"]);
  });

  test("inside a form, saving a view by Enter does not submit the form", async () => {
    const onSubmit = vi.fn<() => void>();
    const screen = await render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <SortPage store={storeWith()} />
      </form>,
    );
    await screen.getByRole("button", { name: "Views" }).click();
    await page.getByRole("menuitem", { name: "Save as a new view…" }).click();
    await page.getByLabelText("Name").fill("Issuers");
    await userEvent.keyboard("{Enter}");
    await expect.element(screen.getByRole("button", { name: "Issuers" })).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
