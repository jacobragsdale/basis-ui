import "#styles.css";

import { useFilters } from "@basis/ui";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { tradeFilters, tradesRouter } from "./filter-bar-trades.ts";
import type { TradeFilterValues } from "./filter-bar-trades.ts";
import { book, chipTexts, choose, expectSearch, issuer, show } from "./filter-bar-test-helpers.tsx";
import { TradesPage } from "./filter-bar.tsx";

beforeEach(async () => {
  await page.viewport(1280, 800);
});

describe("FilterBar's address", () => {
  test("a value the filter cannot take opens as no filter", async () => {
    const router = tradesRouter(TradesPage);
    router.history.push("/?book=equities&issuer=apple&desks=%5B%22UST%22%2C%22Munis%22%5D");
    await show(router);
    expect(chipTexts()).toStrictEqual(["Issuer: apple"]);
    await expect.element(book).toHaveTextContent("Any");
  });

  test("a change keeps the route's other search parameters", async () => {
    const router = tradesRouter(TradesPage);
    router.history.push("/?issuer=apple&selected=t5");
    await show(router);
    await choose(book, "Credit");
    await expectSearch(router, { book: "credit", issuer: "apple", selected: "t5" });
  });
});

/** A saved view, as SavedViews will restore it: every filter at once. */
function RestoreView({ view }: { readonly view: TradeFilterValues }): ReactElement {
  const filters = useFilters(tradeFilters);
  return (
    <button
      type="button"
      onClick={() => {
        filters.setAll(view);
      }}
    >
      Restore the view
    </button>
  );
}

/** The trades page with a button that restores a saved view. */
function PageWithView(): ReactElement {
  return (
    <>
      <TradesPage />
      <RestoreView view={{ book: "credit", par: { min: 1_000_000 } }} />
    </>
  );
}

describe("useFilters' setAll, as a saved view restores filters", () => {
  test("sets every filter of the view in one history entry, and clears the rest", async () => {
    const router = await show(tradesRouter(PageWithView, { issuer: "tre" }));
    const entries = router.history.length;
    await page.getByRole("button", { name: "Restore the view" }).click();
    await expectSearch(router, { book: "credit", par: { min: 1_000_000 } });
    await expect.element(issuer).toHaveValue("");
    expect(router.history.length).toBe(entries + 1);
  });
});
