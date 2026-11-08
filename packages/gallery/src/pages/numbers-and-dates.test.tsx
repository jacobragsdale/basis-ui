import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { NumbersAndDates } from "./numbers-and-dates.tsx";
import { inMode } from "./numbers-and-dates/test-helpers.ts";

/** The family's components, display first, then the inputs, then the form that uses them. */
const sections = [
  "Num",
  "Money",
  "Pct",
  "Bps",
  "Price32",
  "DateTime",
  "Formatted",
  "Signed and aligned",
  "AmountInput",
  "AsOfDatePicker",
  "DateRangePicker",
  "A ticket on TanStack Form",
];

describe("the numbers and dates page", () => {
  test("shows a section for each component, in order", async () => {
    const screen = await render(<NumbersAndDates />);
    const headings = screen.getByRole("heading", { level: 2 }).all();
    expect(headings.map((heading) => heading.element().textContent)).toStrictEqual(sections);
    await Promise.all(
      sections.map(async (title) =>
        expect.element(screen.getByRole("region", { name: title })).toBeVisible(),
      ),
    );
  });

  test("shows every popup closed, so the page loads with nothing over it", async () => {
    await render(<NumbersAndDates />);
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test.each(["light", "dark"] as const)("renders in the %s mode", async (mode) => {
    await inMode(mode, async () => {
      const screen = await render(<NumbersAndDates />);
      const prices = screen.getByRole("table", { name: "Price32 examples" });
      await expect.element(prices.getByText("99-16+", { exact: true })).toBeVisible();
      await expect
        .element(screen.getByRole("textbox", { name: "As of" }).first())
        .toHaveValue("2026-11-10");
    });
  });
});
