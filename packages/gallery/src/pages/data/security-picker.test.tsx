import "#styles.css";

import { SecurityPicker } from "@basis/ui";
import type { SecurityIdentifier } from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { SecurityPickerSection } from "./entity-picker.tsx";
import { securities } from "./fixtures.ts";
import type { Security } from "./fixtures.ts";
import { WithQueryClient } from "./with-query-client.tsx";

/** A SecurityPicker that records what it searches for and finds nothing. */
function RecordingPicker({ searched }: { readonly searched: SecurityIdentifier[] }): ReactElement {
  return (
    <WithQueryClient>
      <SecurityPicker
        aria-label="Security"
        debounceMs={100}
        search={async (identifier) => {
          searched.push(identifier);
          return Promise.resolve<readonly Security[]>([]);
        }}
        itemKey={(security) => security.cusip}
        itemLabel={(security) => security.description}
      />
    </WithQueryClient>
  );
}

/** A SecurityPicker of several that finds the page's securities by CUSIP. */
function PastingPicker(): ReactElement {
  return (
    <WithQueryClient>
      <SecurityPicker
        multiple
        aria-label="Securities"
        search={async (identifier) =>
          Promise.resolve(securities.filter((security) => security.cusip === identifier.value))
        }
        itemKey={(security) => security.cusip}
        itemLabel={(security) => security.description}
      />
    </WithQueryClient>
  );
}

/** Pastes `text` into `element`, as the clipboard would. */
function pasteInto(element: Element, text: string): void {
  const transfer = new DataTransfer();
  transfer.setData("text", text);
  element.dispatchEvent(
    new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }),
  );
}

describe("SecurityPicker", () => {
  test("says which identifiers it takes until the text is long enough for one", async () => {
    const searched: SecurityIdentifier[] = [];
    const screen = await render(<RecordingPicker searched={searched} />);
    await userEvent.type(screen.getByRole("combobox", { name: "Security" }), "9128");
    await expect.element(page.getByText("Type a CUSIP, an ISIN, or a SEDOL.")).toBeVisible();
    expect(searched).toStrictEqual([]);
  });

  test("refuses a CUSIP whose check digit is wrong, says why, and never searches", async () => {
    const searched: SecurityIdentifier[] = [];
    const screen = await render(<RecordingPicker searched={searched} />);
    const input = screen.getByRole("combobox", { name: "Security" });
    await userEvent.type(input, "91282CRF1");
    await expect
      .element(
        page.getByText(
          '"91282CRF1" is not a CUSIP: its check digit should be 0; look for a mistyped character.',
        ),
      )
      .toBeVisible();
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    expect(searched).toStrictEqual([]);
  });

  test("refuses a text of no identifier's length, naming each length", async () => {
    const screen = await render(<RecordingPicker searched={[]} />);
    await userEvent.type(screen.getByRole("combobox", { name: "Security" }), "91282CRF00");
    await expect
      .element(
        page.getByText(
          '"91282CRF00" is not a CUSIP, an ISIN, or a SEDOL: a CUSIP has 9 characters, an ISIN 12, and a SEDOL 7, not 10.',
        ),
      )
      .toBeVisible();
  });

  test("searches for a checked identifier, with its kind, in upper case", async () => {
    const searched: SecurityIdentifier[] = [];
    const screen = await render(<RecordingPicker searched={searched} />);
    await userEvent.type(screen.getByRole("combobox", { name: "Security" }), "us91282crf04");
    await expect.poll(() => searched).toStrictEqual([{ kind: "isin", value: "US91282CRF04" }]);
    await expect.element(page.getByText('No matches for "us91282crf04".')).toBeVisible();
  });

  test("finds a security by its ISIN, and Enter chooses it", async () => {
    const screen = await render(
      <WithQueryClient>
        <SecurityPickerSection />
      </WithQueryClient>,
    );
    const input = screen.getByRole("combobox", { name: "Security" });
    await userEvent.type(input, "US91282CRF04");
    await expect
      .element(page.getByRole("option"))
      .toHaveTextContent("UST 4.625% 08/15/203691282CRF0");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect.element(input).toHaveValue("UST 4.625% 08/15/2036");
    await expect.element(screen.getByText("91282CRF0, ISIN US91282CRF04")).toBeVisible();
  });

  test("adds every security a pasted list finds, and says which identifiers found none", async () => {
    const screen = await render(<PastingPicker />);
    const input = screen.getByRole("combobox", { name: "Securities" });
    await userEvent.click(input);
    pasteInto(input.element(), "91282CRV5\n91282CRT0\n037833100");
    await expect.element(screen.getByText("UST 4.875% 10/31/2033")).toBeVisible();
    await expect.element(screen.getByText("UST 4.750% 10/31/2031")).toBeVisible();
    await expect
      .element(screen.getByText("Added 2 securities. 037833100 matched no security."))
      .toBeVisible();
    await expect.element(input).toHaveValue("");
  });
});
