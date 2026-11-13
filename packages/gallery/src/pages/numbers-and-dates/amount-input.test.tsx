import "#styles.css";

import {
  AmountInput,
  Field,
  FieldLabel,
  amountSuffixes,
  parSuffixes,
  rateSuffixes,
} from "@basis/ui";
import type { Suffixes } from "@basis/ui";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { inCompactDensity } from "./test-helpers.ts";

/** The ids an element's `aria-describedby` names. The echo is an `<output>`, which Chromium reads into the input's
 * description but the matchers' description computation does not, so the tests check the link itself. */
function describedBy(element: Element): readonly string[] {
  return (element.getAttribute("aria-describedby") ?? "").split(" ");
}

/** An AmountInput in a Field, labelled "Amount". */
function AmountField(props: ComponentProps<typeof AmountInput>): ReactElement {
  return (
    <Field>
      <FieldLabel htmlFor="amount">Amount</FieldLabel>
      <AmountInput id="amount" {...props} />
    </Field>
  );
}

const suffixSets: Readonly<Record<string, Suffixes>> = {
  amounts: amountSuffixes,
  par: parSuffixes,
  rates: rateSuffixes,
};

describe("AmountInput", () => {
  test.each([
    { echo: "= 1,500,000", set: "amounts", typed: "1.5mm", value: 1_500_000 },
    { echo: "= 250,000", set: "amounts", typed: "250k", value: 250_000 },
    { echo: "= 0.25%", set: "rates", typed: "25bp", value: 0.0025 },
    { echo: "= 5.25%", set: "rates", typed: "5.25%", value: 0.0525 },
    { echo: "= 0%", set: "rates", typed: "0", value: 0 },
    { echo: "= 5,000", set: "par", typed: "5M", value: 5000 },
    { echo: "= 1,500,000", set: "par", typed: "1.5mm", value: 1_500_000 },
    { echo: "= -1,234.5", set: "amounts", typed: "(1,234.50)", value: -1234.5 },
  ])(
    "$typed with the $set suffixes reads as $value and echoes $echo",
    async ({ echo, set, typed, value }) => {
      const onValueChange = vi.fn<(next: number | string | null) => void>();
      const screen = await render(
        <AmountField suffixes={suffixSets[set]} onValueChange={onValueChange} />,
      );
      const input = screen.getByRole("textbox", { name: "Amount" });
      await userEvent.fill(input, typed);
      await expect.element(input).toHaveValue(typed);
      const status = screen.getByRole("status");
      await expect.element(status).toHaveTextContent(echo);
      expect(describedBy(input.element())).toContain(status.element().id);
      expect(onValueChange).toHaveBeenLastCalledWith(value);
    },
  );

  test("a rate field refuses a bare number, naming the units, and holds the text", async () => {
    const onValueChange = vi.fn<(next: number | string | null) => void>();
    const screen = await render(
      <AmountField suffixes={rateSuffixes} onValueChange={onValueChange} />,
    );
    const input = screen.getByRole("textbox", { name: "Amount" });
    await userEvent.fill(input, "25");
    await userEvent.tab();
    await expect
      .element(input)
      .toHaveAccessibleDescription('"25" needs a unit: write 25% or 25bp.');
    expect(onValueChange).toHaveBeenLastCalledWith("25");
    await userEvent.fill(input, "25bp");
    await expect.element(screen.getByRole("status")).toHaveTextContent("= 0.25%");
    expect(onValueChange).toHaveBeenLastCalledWith(0.0025);
  });

  test("a field left with text it cannot read says why, and holds the text, not a number", async () => {
    const onValueChange = vi.fn<(next: number | string | null) => void>();
    const screen = await render(
      <AmountField suffixes={amountSuffixes} onValueChange={onValueChange} />,
    );
    const input = screen.getByRole("textbox", { name: "Amount" });
    await userEvent.fill(input, "25bp");
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    await userEvent.tab();
    const reason = '"bp" is not a suffix this field accepts: use k, m, mm, b, bn.';
    await expect.element(input).toHaveAccessibleDescription(reason);
    expect([
      input.element().getAttribute("aria-invalid"),
      screen.getByRole("status").query(),
    ]).toStrictEqual(["true", null]);
    expect(onValueChange).toHaveBeenLastCalledWith("25bp");
  });

  test("par reads M as thousands, and refuses k with the suffixes it takes", async () => {
    const screen = await render(<AmountField suffixes={parSuffixes} />);
    const input = screen.getByRole("textbox", { name: "Amount" });
    await userEvent.fill(input, "5k");
    await userEvent.tab();
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent('"k" is not a suffix this field accepts: use m, mm, bn.');
    await userEvent.fill(input, "5m");
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("status")).toHaveTextContent("= 5,000");
  });

  test("shows the form's errors, and a parse reason in their place", async () => {
    const screen = await render(
      <AmountField
        suffixes={amountSuffixes}
        errors={[{ message: "Enter a notional above zero." }]}
      />,
    );
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Enter a notional above zero.");
    await userEvent.fill(screen.getByRole("textbox", { name: "Amount" }), "1.5x");
    await userEvent.tab();
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent('"x" is not a suffix this field accepts: use k, m, mm, b, bn.');
  });

  test("clearing the field gives null and no echo", async () => {
    const onValueChange = vi.fn<(next: number | string | null) => void>();
    const screen = await render(
      <AmountField defaultValue={250_000} onValueChange={onValueChange} />,
    );
    const input = screen.getByRole("textbox", { name: "Amount" });
    await expect.element(screen.getByRole("status")).toHaveTextContent("= 250,000");
    await userEvent.clear(input);
    expect(onValueChange).toHaveBeenLastCalledWith(null);
    await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
  });

  test("a value set from outside replaces what was typed", async () => {
    const screen = await render(<AmountField value={1_500_000} />);
    const input = screen.getByRole("textbox", { name: "Amount" });
    await expect.element(input).toHaveValue("1500000");
    await screen.rerender(<AmountField value={2000} />);
    await expect.element(input).toHaveValue("2000");
    await expect.element(screen.getByRole("status")).toHaveTextContent("= 2,000");
  });

  test.each([
    { shown: "0.3", value: 0.1 + 0.2 },
    { shown: "0.0000001", value: 1e-7 },
    { shown: "1500000000000000000000", value: 1.5e21 },
    { shown: "-1234.5", value: -1234.5 },
  ])(
    "a value of $value set from outside shows as $shown, which it reads back",
    async ({ shown, value }) => {
      const screen = await render(<AmountField value={value} />);
      const input = screen.getByRole("textbox", { name: "Amount" });
      await expect.element(input).toHaveValue(shown);
      input.element().focus();
      await userEvent.tab();
      await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    },
  );

  test("in a horizontal Field, its echo and error sit under the input, not beside it", async () => {
    const screen = await render(
      <Field orientation="horizontal">
        <FieldLabel htmlFor="amount">Amount</FieldLabel>
        <AmountInput id="amount" defaultValue={250_000} errors={[{ message: "Too large." }]} />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Amount" }).element().getBoundingClientRect();
    const echo = screen.getByRole("status").element().getBoundingClientRect();
    const error = screen.getByRole("alert").element().getBoundingClientRect();
    expect([echo.top >= input.bottom, error.top >= echo.bottom]).toStrictEqual([true, true]);
  });

  test("stays at least 24 px tall in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<AmountField />);
      const box = screen.getByRole("textbox", { name: "Amount" }).element().getBoundingClientRect();
      expect(box.height).toBeGreaterThanOrEqual(24);
    });
  });
});
