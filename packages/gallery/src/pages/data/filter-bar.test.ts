import "#styles.css";

import { FilterBar } from "@basis/ui";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import {
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
  typeIssuer,
} from "./filter-bar-test-helpers.tsx";
import { inCompactDensity } from "./test-helpers.ts";

beforeEach(async () => {
  await page.viewport(1280, 800);
});

describe(FilterBar, () => {
  test("is a search landmark, each filter's control named by its label", async () => {
    await openTrades();
    await expect.element(issuer).toBeVisible();
    await expect.element(book).toHaveTextContent("Any");
    await expect.element(bar.getByRole("combobox", { name: "Desks" })).toBeVisible();
    await expect.element(bar.getByRole("button", { name: "Settles" })).toBeVisible();
    await expect.element(par.getByRole("textbox", { name: "Min" })).toBeVisible();
    await expect.element(par.getByRole("textbox", { name: "Max" })).toBeVisible();
    await expect.element(chips).not.toBeInTheDocument();
    expect(issuers()).toHaveLength(6);
  });

  test("opens with the filters its address holds, as chips, and keeps only their rows", async () => {
    await openTrades({
      book: "rates",
      desks: ["UST", "Agency"],
      issuer: "tre",
      par: { min: 5_000_000 },
      settles: { end: "2026-11-06", start: "2026-11-02" },
    });
    expect(chipTexts()).toStrictEqual([
      "Issuer: tre",
      "Book: Rates",
      "Desks: UST, Agency",
      "Settles: 2026-11-02 – 2026-11-06",
      "Par: at least 5,000,000",
    ]);
    expect(issuers()).toStrictEqual(["US Treasury", "US Treasury"]);
  });

  test("its controls show the filters its address holds", async () => {
    await openTrades({
      book: "rates",
      issuer: "tre",
      par: { min: 5_000_000 },
      settles: { end: "2026-11-06", start: "2026-11-02" },
    });
    await expect.element(issuer).toHaveValue("tre");
    await expect.element(book).toHaveTextContent("Rates");
    await expect
      .element(bar.getByRole("button", { name: "Settles" }))
      .toHaveAccessibleDescription("2026-11-02 – 2026-11-06");
    await expect.element(par.getByRole("textbox", { name: "Min" })).toHaveValue("5000000");
  });
});

describe("FilterBar's text filter", () => {
  test("filters once typing pauses, in one history entry", async () => {
    const router = await openTrades();
    const entries = router.history.length;
    await typeIssuer("fannie");
    await expectSearch(router, { issuer: "fannie" });
    expect(issuers()).toStrictEqual(["Fannie Mae"]);
    expect(chipTexts()).toStrictEqual(["Issuer: fannie"]);
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}");
    await expectSearch(router, { issuer: "f" });
    expect(router.history.length).toBe(entries + 1);
  });

  test("Back undoes the typing in one step, and Forward brings it back", async () => {
    const router = await openTrades();
    await typeIssuer("mae");
    await expectSearch(router, { issuer: "mae" });
    router.history.back();
    await expectSearch(router, {});
    await expect.element(issuer).toHaveValue("");
    expect(issuers()).toHaveLength(6);
    router.history.forward();
    await expect.element(issuer).toHaveValue("mae");
    expect(issuers()).toStrictEqual(["Fannie Mae"]);
  });

  test("typing after Back adds an entry, rather than replacing the one Back went to", async () => {
    const router = await openTrades();
    await typeIssuer("mae");
    await expectSearch(router, { issuer: "mae" });
    router.history.back();
    await expect.element(issuer).toHaveValue("");
    await typeIssuer("apple");
    await expectSearch(router, { issuer: "apple" });
    router.history.back();
    await expectSearch(router, {});
  });

  test("Enter writes the text at once", async () => {
    const router = await openTrades();
    await issuer.fill("apple");
    await userEvent.keyboard("{Enter}");
    expect(searchOf(router)).toStrictEqual({ issuer: "apple" });
  });

  test("leaving the box and typing again adds another history entry", async () => {
    const router = await openTrades();
    const entries = router.history.length;
    await issuer.fill("apple");
    await userEvent.tab();
    await issuer.fill("micro");
    await userEvent.tab();
    await expectSearch(router, { issuer: "micro" });
    expect(router.history.length).toBe(entries + 2);
    router.history.back();
    await expect.element(issuer).toHaveValue("apple");
  });
});

describe("FilterBar's choices", () => {
  test("a choice filters at once, in a history entry of its own, and Any clears it", async () => {
    const router = await openTrades();
    await choose(book, "Credit");
    await expectSearch(router, { book: "credit" });
    expect(issuers()).toStrictEqual(["Apple Inc", "Microsoft"]);
    await choose(book, "Any");
    await expectSearch(router, {});
  });

  test("Back and Forward step through the choices", async () => {
    const router = await openTrades();
    await choose(book, "Credit");
    await choose(book, "Rates");
    await expectSearch(router, { book: "rates" });
    router.history.back();
    await expect.element(book).toHaveTextContent("Credit");
    router.history.back();
    await expect.element(book).toHaveTextContent("Any");
    router.history.forward();
    await expect.element(book).toHaveTextContent("Credit");
  });

  test("several choices are chips in the box, and one chip in the bar", async () => {
    const router = await openTrades();
    await bar.getByRole("combobox", { name: "Desks" }).click();
    await page.getByRole("option", { name: "UST" }).click();
    await page.getByRole("option", { name: "IG" }).click();
    await userEvent.keyboard("{Escape}");
    await expectSearch(router, { desks: ["UST", "IG"] });
    expect(chipTexts()).toStrictEqual(["Desks: UST, IG"]);
    expect(issuers()).toStrictEqual(["US Treasury", "US Treasury", "Apple Inc", "Microsoft"]);
  });
});

describe("FilterBar's range of numbers", () => {
  test("reads each end by the filter's suffixes", async () => {
    const router = await openTrades();
    await par.getByRole("textbox", { name: "Min" }).fill("5m");
    await par.getByRole("textbox", { name: "Max" }).fill("10mm");
    await expect.poll(() => chipTexts()).toStrictEqual(["Par: 5,000 – 10,000,000"]);
    await par.getByRole("textbox", { name: "Min" }).fill("5mm");
    await expectSearch(router, { par: { max: 10_000_000, min: 5_000_000 } });
    expect(issuers()).toStrictEqual(["US Treasury", "Fannie Mae", "Microsoft"]);
  });

  test("writes nothing while an end reads as no number", async () => {
    const router = await openTrades({ par: { min: 5_000_000 } });
    await par.getByRole("textbox", { name: "Max" }).fill("10x");
    await userEvent.tab();
    await expect.element(par.getByRole("textbox", { name: "Max" })).toHaveValue("10x");
    expect(searchOf(router)).toStrictEqual({ par: { min: 5_000_000 } });
  });
});

describe("FilterBar's chips", () => {
  test("a chip clears its filter, in a history entry of its own", async () => {
    const router = await openTrades({ book: "rates", issuer: "mae", par: { max: 3_000_000 } });
    const entries = router.history.length;
    await chips.getByRole("button", { name: "Clear Issuer" }).click();
    await expectSearch(router, { book: "rates", par: { max: 3_000_000 } });
    await expect.element(issuer).toHaveValue("");
    expect(issuers()).toStrictEqual(["Freddie Mac"]);
    expect(router.history.length).toBe(entries + 1);
  });

  test("Clear all clears every filter in one history entry, which Back undoes", async () => {
    const router = await openTrades({ book: "rates", par: { max: 3_000_000 } });
    await page.getByRole("button", { name: "Clear all" }).click();
    await expectSearch(router, {});
    await expect.element(chips).not.toBeInTheDocument();
    router.history.back();
    await expect.element(book).toHaveTextContent("Rates");
    expect(chipTexts()).toStrictEqual(["Book: Rates", "Par: at most 3,000,000"]);
  });

  test("a chip's button keeps the 24 px target in the compact density", async () => {
    await inCompactDensity(async () => {
      await openTrades({ issuer: "tre" });
      const button = chips.getByRole("button", { name: "Clear Issuer" }).element();
      const { width, height } = button.getBoundingClientRect();
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(24);
    });
  });
});
