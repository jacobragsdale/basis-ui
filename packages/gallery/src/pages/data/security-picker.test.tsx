import "#styles.css";

import { SecurityPicker } from "@basis/ui";
import type { SecurityIdentifier } from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { SecurityPickerSection } from "./entity-picker.tsx";
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
});
