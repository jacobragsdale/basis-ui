import "#styles.css";

import { ApiError, EntityPicker } from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { EntityPickerSection } from "./entity-picker.tsx";
import { issuers } from "./fixtures.ts";
import type { Issuer } from "./fixtures.ts";
import { searchIssuers } from "./searches.ts";
import { heldSearch } from "./test-helpers.ts";
import type { SearchCall } from "./test-helpers.ts";
import { WithQueryClient } from "./with-query-client.tsx";

const [treasury, fannie, freddie] = issuers;

/** An issuer picker on a search the test passes. */
function IssuerPicker({
  search,
  onValueChange,
  validate,
}: {
  readonly search: (text: string, signal: AbortSignal) => Promise<readonly Issuer[]>;
  readonly onValueChange?: (issuer: Issuer | null) => void;
  readonly validate?: (text: string) => string | undefined;
}): ReactElement {
  return (
    <WithQueryClient>
      <EntityPicker
        aria-label="Issuer"
        debounceMs={150}
        search={search}
        itemKey={(issuer) => issuer.id}
        itemLabel={(issuer) => issuer.name}
        onValueChange={onValueChange}
        validate={validate}
      />
    </WithQueryClient>
  );
}

/** The options the open list shows, by their text. */
function options(): string[] {
  return page
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent);
}

/** Types "fan", waits for its search, then types "nie", and waits for the search for "fannie". */
async function searchTwice(input: Locator, calls: readonly SearchCall<Issuer>[]): Promise<void> {
  await userEvent.type(input, "fan");
  await expect.poll(() => calls.length).toBe(1);
  await userEvent.type(input, "nie");
  await expect.poll(() => calls.length).toBe(2);
}

describe("EntityPicker's search", () => {
  test("waits for typing to stop, then searches once, for the whole text", async () => {
    const held = heldSearch<Issuer>();
    const screen = await render(<IssuerPicker search={held.search} />);
    await userEvent.type(screen.getByRole("combobox", { name: "Issuer" }), "fre");
    await expect.poll(() => held.calls.map((call) => call.text)).toStrictEqual(["fre"]);
    await expect.element(page.getByText("Searching…")).toBeVisible();
    held.calls[0]?.answer(freddie === undefined ? [] : [freddie]);
    await expect.poll(options).toStrictEqual(["Freddie Mac"]);
    expect(held.calls).toHaveLength(1);
  });

  test("aborts the search a newer text replaced", async () => {
    const held = heldSearch<Issuer>();
    const screen = await render(<IssuerPicker search={held.search} />);
    const input = screen.getByRole("combobox", { name: "Issuer" });
    await searchTwice(input, held.calls);
    expect(held.calls.map((call) => call.text)).toStrictEqual(["fan", "fannie"]);
    expect(held.calls.map((call) => call.signal.aborted)).toStrictEqual([true, false]);
  });

  test("shows only the last search's results, even when a stale one answers after it", async () => {
    const held = heldSearch<Issuer>();
    const screen = await render(<IssuerPicker search={held.search} />);
    const input = screen.getByRole("combobox", { name: "Issuer" });
    await searchTwice(input, held.calls);
    const [stale, latest] = held.calls;
    latest?.answer(fannie === undefined ? [] : [fannie]);
    // A server that ignores the abort still answers, later; the picker shows nothing of it.
    stale?.answer(treasury === undefined ? [] : [treasury]);
    await expect.poll(options).toStrictEqual(["Fannie Mae"]);
    await expect.element(page.getByRole("option", { name: "US Treasury" })).not.toBeInTheDocument();
  });

  test("says when nothing matches", async () => {
    const screen = await render(<IssuerPicker search={searchIssuers} />);
    await userEvent.type(screen.getByRole("combobox", { name: "Issuer" }), "zzz");
    await expect.element(page.getByText('No matches for "zzz".')).toBeVisible();
  });

  test("shows a failed search's error, read from problem details", async () => {
    const problem = {
      detail: "Issuer search is down for maintenance.",
      status: 503,
      title: "Search is unavailable",
      type: "unavailable",
    };
    const screen = await render(
      <IssuerPicker
        search={async () => Promise.reject(new ApiError(problem.status, problem, problem.title))}
      />,
    );
    await userEvent.type(screen.getByRole("combobox", { name: "Issuer" }), "fre");
    await expect
      .element(page.getByText("Search is unavailable: Issuer search is down for maintenance."))
      .toBeVisible();
  });

  test("does not search a text the app's check refuses, and says why", async () => {
    const held = heldSearch<Issuer>();
    const screen = await render(
      <IssuerPicker
        search={held.search}
        validate={(text) => (/\d/u.test(text) ? "Issuer names have no digits." : undefined)}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Issuer" });
    await userEvent.type(input, "f2");
    await expect.element(page.getByText("Issuer names have no digits.")).toBeVisible();
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    expect(held.calls).toHaveLength(0);
  });
});

describe("EntityPicker's choices", () => {
  test("the arrow keys move through the results and Enter chooses one", async () => {
    const chosen: (Issuer | null)[] = [];
    const screen = await render(
      <IssuerPicker
        search={searchIssuers}
        onValueChange={(issuer) => {
          chosen.push(issuer);
        }}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Issuer" });
    await userEvent.type(input, "mae");
    await expect.poll(options).toStrictEqual(["Fannie Mae", "Ginnie Mae"]);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await expect.element(input).toHaveValue("Ginnie Mae");
    expect(chosen.map((issuer) => issuer?.name)).toStrictEqual(["Ginnie Mae"]);
  });

  test("with multiple, each choice is a chip with a button that removes it", async () => {
    const screen = await render(
      <WithQueryClient>
        <EntityPickerSection />
      </WithQueryClient>,
    );
    const input = screen.getByRole("combobox", { name: "Issuers" });
    await expect.element(screen.getByRole("button", { name: "Remove Fannie Mae" })).toBeVisible();
    await userEvent.type(input, "ginnie");
    // The section draws each issuer with its sector after its name.
    await expect.poll(options).toStrictEqual(["Ginnie MaeAgency"]);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect.element(screen.getByRole("button", { name: "Remove Ginnie Mae" })).toBeVisible();
    await screen.getByRole("button", { name: "Remove Fannie Mae" }).click();
    await expect
      .element(screen.getByRole("button", { name: "Remove Fannie Mae" }))
      .not.toBeInTheDocument();
  });

  test("disabled, its input is disabled", async () => {
    const screen = await render(
      <WithQueryClient>
        <EntityPickerSection />
      </WithQueryClient>,
    );
    await expect.element(screen.getByRole("combobox", { name: "Issuer" }).nth(1)).toBeDisabled();
  });
});
