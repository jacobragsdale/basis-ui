import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { Data } from "./data.tsx";

/** The family's components, the table first, then the pickers, then the import. */
const sections = ["DataTable", "DataTable states", "EntityPicker", "SecurityPicker", "FileImport"];

describe("the data page", () => {
  test("shows a section for each component, in order", async () => {
    const screen = await render(<Data />);
    const headings = screen.getByRole("heading", { level: 2 }).all();
    expect(headings.map((heading) => heading.element().textContent)).toStrictEqual(sections);
    await Promise.all(
      sections.map(async (title) =>
        expect.element(screen.getByRole("region", { name: title })).toBeVisible(),
      ),
    );
  });

  test("shows every popup closed, so the page loads with nothing over it", async () => {
    await render(<Data />);
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
  });

  test("shows the positions, the states, the pickers and the drop zone", async () => {
    const screen = await render(<Data />);
    await expect.element(screen.getByRole("table", { name: "Positions" })).toBeVisible();
    await expect
      .element(screen.getByRole("table", { name: "Loading positions" }))
      .toHaveAttribute("aria-busy", "true");
    await expect.element(screen.getByText("The credit book holds nothing today.")).toBeVisible();
    await expect
      .element(screen.getByRole("alert", { name: "Positions are unavailable" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("alert", { name: "Too many rows for this table" }))
      .toBeVisible();
    await expect.element(screen.getByRole("combobox", { name: "Issuer" }).first()).toBeVisible();
    await expect.element(screen.getByRole("combobox", { name: "Security" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Choose a file" })).toBeVisible();
  });
});
