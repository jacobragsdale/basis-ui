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
    { echo: "= 0.0025", set: "rates", typed: "25bp", value: 0.0025 },
    { echo: "= 0.0525", set: "rates", typed: "5.25%", value: 0.0525 },
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

  test("stays at least 24 px tall in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<AmountField />);
      const box = screen.getByRole("textbox", { name: "Amount" }).element().getBoundingClientRect();
      expect(box.height).toBeGreaterThanOrEqual(24);
    });
  });
});
