import "#styles.css";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { ComboboxSection } from "./combobox.tsx";
import { computedColour, inCompactDensity, sizeOf } from "./test-helpers.ts";

const issuers = ["Treasury", "Fannie Mae", "Freddie Mac", "World Bank"];

/** A combobox of issuers, named "Issuer". */
function IssuerCombobox({ showClear = false }: { readonly showClear?: boolean }): ReactElement {
  return (
    <Combobox items={issuers}>
      <ComboboxInput aria-label="Issuer" showClear={showClear} />
      <ComboboxContent>
        <ComboboxEmpty>No issuer matches.</ComboboxEmpty>
        <ComboboxList>
          {(issuer: string) => (
            <ComboboxItem key={issuer} value={issuer}>
              {issuer}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

describe("Combobox", () => {
  test("is a combobox named by its label, whose list typing filters", async () => {
    const screen = await render(<IssuerCombobox />);
    const input = screen.getByRole("combobox", { name: "Issuer" });
    await input.fill("mac");
    await expect.element(screen.getByRole("listbox")).toBeVisible();
    expect(
      screen
        .getByRole("option")
        .all()
        .map((option) => option.element().textContent),
    ).toStrictEqual(["Freddie Mac"]);
  });

  test("the arrow keys move through the matches and Enter chooses one", async () => {
    const screen = await render(<IssuerCombobox />);
    const input = screen.getByRole("combobox", { name: "Issuer" });
    await input.click();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(screen.getByRole("listbox")).toBeVisible();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    await expect.element(input).toHaveValue("Fannie Mae");
  });

  test("says so when nothing matches", async () => {
    const screen = await render(<IssuerCombobox />);
    await screen.getByRole("combobox", { name: "Issuer" }).fill("zzz");
    await expect.element(screen.getByText("No issuer matches.")).toBeVisible();
  });

  test("its open list lines up with the input's outline and spans it", async () => {
    // Away from the viewport's edge, which the popup keeps 5 px clear of.
    const screen = await render(
      <div className="p-8">
        <IssuerCombobox />
      </div>,
    );
    const input = screen.getByRole("combobox", { name: "Issuer" });
    await input.click();
    await userEvent.keyboard("{ArrowDown}");
    const group = input.element().closest('[data-slot="input-group"]')?.getBoundingClientRect();
    // The popup scales in from 95 %, so its box settles once the transition ends.
    await expect
      .poll(() => {
        const popup = document.querySelector('[data-slot="combobox-content"]');
        const box = popup?.getBoundingClientRect();
        return [box?.left, box?.width];
      })
      .toStrictEqual([group?.left, group?.width]);
  });

  test("its trigger and clear buttons are named, and the clear button empties it", async () => {
    const screen = await render(<IssuerCombobox showClear />);
    const input = screen.getByRole("combobox", { name: "Issuer" });
    await expect.element(screen.getByRole("button", { name: "Show options" })).toBeInTheDocument();
    await input.fill("Treas");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect.element(input).toHaveValue("Treasury");
    await screen.getByRole("button", { name: "Clear" }).click();
    await expect.element(input).toHaveValue("");
  });

  test("its chips show several choices, each with a named remove button", async () => {
    const screen = await render(<ComboboxSection />);
    const chips = screen.getByRole("combobox", { name: "Issuers" });
    await expect.element(chips).toBeVisible();
    await expect.element(screen.getByText("World Bank", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Remove Treasury" })).toBeVisible();
    await screen.getByRole("button", { name: "Remove World Bank" }).click();
    await expect.element(screen.getByText("World Bank", { exact: true })).not.toBeInTheDocument();
  });

  test("disabled, its input is disabled", async () => {
    const screen = await render(<ComboboxSection />);
    await expect.element(screen.getByRole("combobox", { name: "Issuer" }).nth(2)).toBeDisabled();
  });

  test("invalid, its outline takes the destructive colour and its error says why", async () => {
    const screen = await render(<ComboboxSection />);
    const invalid = screen.getByRole("combobox", { name: "Issuer" }).nth(3);
    await expect.element(invalid).toHaveAttribute("aria-invalid", "true");
    await expect.element(invalid).toHaveAccessibleDescription("Choose an issuer.");
    const group = invalid.element().closest('[data-slot="input-group"]');
    expect(group === null ? "" : getComputedStyle(group).borderTopColor).toBe(
      computedColour("var(--destructive)"),
    );
  });

  test("its buttons stay at least 24 px across in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<IssuerCombobox showClear />);
      for (const button of screen.getByRole("button").all()) {
        const [width, height] = sizeOf(button.element());
        expect(width).toBeGreaterThanOrEqual(24);
        expect(height).toBeGreaterThanOrEqual(24);
      }
    });
  });
});
