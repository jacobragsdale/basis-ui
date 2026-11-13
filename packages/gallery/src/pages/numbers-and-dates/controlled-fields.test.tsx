/* The fields over time, with a parent that holds their value: a parent that keeps only numbers or dates, mapping what
 * the field cannot read to `null` or ignoring it, and a form reset after text the field refused. What was typed stays
 * while the parent holds no value or the one it was typed over, and goes when the parent sets another, or resets. */

import "#styles.css";

import { AmountInput, Button, DatePicker, FormAmountField, FormDateField } from "@basis/ui";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

/** A par a parent keeps as a number or nothing: what does not read is `null`, or, when `ignore`, left as it was. */
function NumbersOnly({ ignore = false }: { readonly ignore?: boolean }): ReactElement {
  const [par, setPar] = useState<number | null>(null);
  return (
    <>
      <AmountInput
        aria-label="Par"
        value={par}
        onValueChange={(next) => {
          if (typeof next === "number") {
            setPar(next);
          } else if (!ignore) {
            setPar(null);
          }
        }}
      />
      <output aria-label="Kept">{par === null ? "none" : String(par)}</output>
    </>
  );
}

/** A maturity a parent keeps only while it is a date, ignoring `null`, starting at 2030-11-15. */
function DatesOnly(): ReactElement {
  const [maturity, setMaturity] = useState(Temporal.PlainDate.from("2030-11-15"));
  return (
    <>
      <DatePicker
        aria-label="Maturity"
        value={maturity}
        onValueChange={(next) => {
          if (next !== null) {
            setMaturity(next);
          }
        }}
      />
      <Button
        onClick={() => {
          setMaturity(Temporal.PlainDate.from("2031-05-15"));
        }}
      >
        Roll
      </Button>
    </>
  );
}

/** A form of a date and an amount, with a button that resets it. */
function ResetForm(): ReactElement {
  const form = useForm({ defaultValues: { par: null as number | string | null, settles: "" } });
  return (
    <>
      <form.Field name="settles">
        {(field) => <FormDateField field={field} label="Settles" />}
      </form.Field>
      <form.Field name="par">{(field) => <FormAmountField field={field} label="Par" />}</form.Field>
      <Button
        onClick={() => {
          form.reset();
        }}
      >
        Reset
      </Button>
    </>
  );
}

const par = page.getByRole("textbox", { name: "Par" });

describe("A parent that keeps only numbers", () => {
  test.each([
    { ignore: false, parent: "maps what does not read to null" },
    { ignore: true, parent: "ignores what does not read" },
  ])("that $parent keeps every key of a negative, grouped number", async ({ ignore }) => {
    await render(<NumbersOnly ignore={ignore} />);
    await par.click();
    await userEvent.keyboard("-1,234");
    await expect.element(par).toHaveValue("-1,234");
    await expect.element(page.getByRole("status", { name: "Kept" })).toHaveTextContent("-1234");
  });

  test("keeps a parenthesised negative, typed key by key", async () => {
    await render(<NumbersOnly />);
    await par.click();
    await userEvent.keyboard("(1,000)");
    await expect.element(par).toHaveValue("(1,000)");
    await expect.element(page.getByRole("status", { name: "Kept" })).toHaveTextContent("-1000");
  });
});

describe("A parent that keeps only dates", () => {
  test("keeps the refused text and its reason, until it sets another date", async () => {
    await render(<DatesOnly />);
    const maturity = page.getByRole("textbox", { name: "Maturity" });
    await userEvent.fill(maturity, "13/45/2030");
    await userEvent.tab();
    await expect.element(maturity).toHaveValue("13/45/2030");
    await expect.element(maturity).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(page.getByRole("button", { name: "Roll" }));
    await expect.element(maturity).toHaveValue("2031-05-15");
    await expect.element(maturity).not.toHaveAttribute("aria-invalid", "true");
  });
});

describe("A form reset", () => {
  test("clears a date the field refused, and its reason", async () => {
    await render(<ResetForm />);
    const settles = page.getByRole("textbox", { name: "Settles" });
    await userEvent.fill(settles, "13/45/2026");
    await userEvent.tab();
    await expect.element(settles).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(page.getByRole("button", { name: "Reset" }));
    await expect.element(settles).toHaveValue("");
    await expect.element(settles).not.toHaveAttribute("aria-invalid", "true");
  });

  test("clears an amount the field cannot read", async () => {
    await render(<ResetForm />);
    await userEvent.fill(par, "5x");
    await userEvent.tab();
    await expect.element(par).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(page.getByRole("button", { name: "Reset" }));
    await expect.element(par).toHaveValue("");
  });
});
