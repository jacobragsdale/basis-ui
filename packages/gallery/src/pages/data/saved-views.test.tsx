import "#styles.css";

import { SavedViews, browserViewStore } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
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

/** A page whose state is a sort, shown as text, with its views and a button that changes it. */
function SortPage({ store }: { readonly store: ReturnType<typeof storeWith> }): ReactElement {
  const [sort, setSort] = useState<Sort>({ by: "issuer" });
  return (
    <WithQueryClient>
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
    </WithQueryClient>
  );
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

  test("stops opening the view shown by default", async () => {
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
});
