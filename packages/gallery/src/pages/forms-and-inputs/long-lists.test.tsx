/* Long lists: a combobox draws at most 100 items and says to type to narrow them, and a select past 100 items
 * reports an error naming Combobox. */

import "#styles.css";

import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@basis/ui";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

/** 250 issuers, as a long list a page might hold. */
const issuers = Array.from(
  { length: 250 },
  (_unused, index) => `Issuer ${String(index + 1).padStart(3, "0")}`,
);

/** Keeps the console quiet while a test listens to it. */
function quiet(): void {
  // The test reads the calls the spy records; nothing need reach the console.
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Combobox", () => {
  test("draws 100 of a long list's items, and says to type to narrow them", async () => {
    const screen = await render(
      <Combobox items={issuers}>
        <ComboboxInput aria-label="Issuer" />
        <ComboboxContent>
          <ComboboxList>
            {(issuer: string) => (
              <ComboboxItem key={issuer} value={issuer}>
                {issuer}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Issuer" }));
    await expect
      .element(page.getByText("Showing the first 100. Type to narrow them."))
      .toBeVisible();
    expect(page.getByRole("option").all()).toHaveLength(100);
    await userEvent.type(screen.getByRole("combobox", { name: "Issuer" }), "Issuer 24");
    await expect.element(page.getByRole("option", { name: "Issuer 240" })).toBeVisible();
    await expect.element(page.getByText(/^Showing /u)).not.toBeInTheDocument();
  });
});

describe("Select", () => {
  test("reports one error naming Combobox when it holds more than 100 items", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(quiet);
    const items = issuers.map((issuer) => ({ label: issuer, value: issuer }));
    const screen = await render(
      <Select items={items}>
        <SelectTrigger aria-label="Issuer">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );
    await expect.element(screen.getByRole("combobox", { name: "Issuer" })).toBeVisible();
    const messages = reported.mock.calls.map(([, error]) =>
      error instanceof Error ? error.message : "",
    );
    expect(messages).toContain(
      "ERROR a Select holds 250 items, past the 100 a select lists well: use Combobox, which draws 100 and narrows as the user types.",
    );
  });
});
