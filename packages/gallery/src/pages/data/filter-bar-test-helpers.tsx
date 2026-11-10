/* What the filter bar's tests share: the page of trades in a router of its own, and what its address, table and chips
 * hold. */

import { RouterProvider } from "@tanstack/react-router";
import { expect } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { tradesRouter } from "./filter-bar-trades.ts";
import type { TradeFilterValues } from "./filter-bar-trades.ts";
import { TradesPage } from "./filter-bar.tsx";
import { columnText } from "./test-helpers.ts";

type Router = ReturnType<typeof tradesRouter>;

const bar = page.getByRole("search", { name: "Trade filters" });
const chips = page.getByRole("list", { name: "Active filters" });
const issuer = bar.getByRole("searchbox", { name: "Issuer" });
const book = bar.getByRole("combobox", { name: "Book" });
const par = bar.getByRole("group", { name: "Par" });

/** Shows the router's page, once its table is up. */
async function show(router: Router): Promise<Router> {
  await render(<RouterProvider router={router} />);
  await expect.element(page.getByRole("table", { name: "Trades" })).toBeVisible();
  return router;
}

/** The page of trades, opened with `search` as its search parameters, and its router. */
async function openTrades(search: TradeFilterValues = {}): Promise<Router> {
  return show(tradesRouter(TradesPage, search));
}

/** The issuers the table shows, in order. */
function issuers(): string[] {
  return columnText(page.getByRole("table", { name: "Trades" }), 0);
}

/** The search parameters the router's address holds, as plain data. */
function searchOf(router: Router): unknown {
  return structuredClone(router.state.location.search);
}

/** Waits for the address to hold `search`. */
async function expectSearch(router: Router, search: unknown): Promise<void> {
  await expect.poll(() => searchOf(router)).toStrictEqual(search);
}

/** Each chip's text. */
function chipTexts(): string[] {
  return [...chips.element().querySelectorAll("li")].map((chip) => chip.textContent);
}

/** Picks `option` in a Select. */
async function choose(trigger: Locator, option: string): Promise<void> {
  await trigger.click();
  await page.getByRole("option", { name: option }).click();
}

/** Types `text` into the issuer box, key by key, after clicking into it. */
async function typeIssuer(text: string): Promise<void> {
  await issuer.click();
  await userEvent.keyboard(text);
}

export {
  bar,
  book,
  chipTexts,
  chips,
  choose,
  expectSearch,
  issuer,
  issuers,
  openTrades,
  par,
  searchOf,
  show,
  typeIssuer,
};
export type { Router };
