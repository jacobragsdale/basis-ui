/* FormSecurityField: SecurityPicker bound to a form's field, holding the chosen security's identifier and showing the
 * field's errors once it has been touched. */

import "#styles.css";

import { FormSecurityField } from "@basis/ui";
import type { FormFieldApi } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { securities } from "./fixtures.ts";
import { WithQueryClient } from "./with-query-client.tsx";

/** A form's field as TanStack Form shapes it, recording each value the field is given, and each blur. */
const untouched: FormFieldApi<string>["state"]["meta"] = { errors: [], isTouched: false };

function fieldOf(
  changes: string[],
  meta: FormFieldApi<string>["state"]["meta"] = untouched,
): FormFieldApi<string> {
  return {
    handleBlur: () => {
      changes.push("(blur)");
    },
    handleChange: (value) => {
      changes.push(value);
    },
    name: "cusip",
    state: { meta, value: "" },
  };
}

async function search(identifier: { readonly value: string }): Promise<typeof securities> {
  return Promise.resolve(securities.filter((security) => security.cusip === identifier.value));
}

describe("FormSecurityField", () => {
  test("holds the chosen security's identifier, labelled by its label", async () => {
    const changes: string[] = [];
    const [security] = securities;
    const screen = await render(
      <WithQueryClient>
        <FormSecurityField
          field={fieldOf(changes)}
          label="Bond"
          search={search}
          itemKey={(item) => item.cusip}
          itemLabel={(item) => item.description}
        />
      </WithQueryClient>,
    );
    await userEvent.type(screen.getByRole("combobox", { name: "Bond" }), security?.cusip ?? "");
    await userEvent.click(page.getByRole("option", { name: security?.description ?? "" }));
    expect(changes).toStrictEqual([security?.cusip, "(blur)"]);
  });

  test("shows the field's errors once touched, and marks the picker invalid", async () => {
    const screen = await render(
      <WithQueryClient>
        <FormSecurityField
          field={fieldOf([], { errors: ["Choose the bond to trade."], isTouched: true })}
          label="Bond"
          search={search}
          itemKey={(item) => item.cusip}
          itemLabel={(item) => item.description}
        />
      </WithQueryClient>,
    );
    await expect.element(page.getByText("Choose the bond to trade.")).toBeVisible();
    await expect
      .element(screen.getByRole("combobox", { name: "Bond" }))
      .toHaveAttribute("aria-invalid", "true");
  });
});
