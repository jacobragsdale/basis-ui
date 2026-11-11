import "#styles.css";

import { Field, FieldLabel, MonthPicker } from "@basis/ui";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { focusIsOn } from "./test-helpers.ts";

const month = (text: string): Temporal.PlainYearMonth => Temporal.PlainYearMonth.from(text);

/** A MonthPicker in a Field, labelled "Statement month". */
function StatementField(props: Partial<ComponentProps<typeof MonthPicker>>): ReactElement {
  return (
    <Field>
      <FieldLabel htmlFor="statement">Statement month</FieldLabel>
      <MonthPicker id="statement" {...props} />
    </Field>
  );
}

describe("MonthPicker", () => {
  test("names its month, and opens on it, focused and pressed", async () => {
    const screen = await render(<StatementField defaultValue={month("2026-10")} />);
    const trigger = screen.getByRole("button", { name: "Statement month" });
    await expect.element(trigger).toHaveTextContent("October 2026");
    await userEvent.click(trigger);
    const october = page.getByRole("button", { name: "Oct 2026" });
    await focusIsOn(october);
    await expect.element(october).toHaveAttribute("aria-pressed", "true");
  });

  test("the arrow keys move a month or a quarter, and Enter chooses", async () => {
    const onValueChange = vi.fn<(next: Temporal.PlainYearMonth) => void>();
    const screen = await render(
      <StatementField defaultValue={month("2026-10")} onValueChange={onValueChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Statement month" }));
    await focusIsOn(page.getByRole("button", { name: "Oct 2026" }));
    await userEvent.keyboard("{ArrowUp}");
    await focusIsOn(page.getByRole("button", { name: "Jul 2026" }));
    await userEvent.keyboard("{ArrowRight}{Enter}");
    expect(onValueChange.mock.lastCall?.[0]?.toString()).toBe("2026-08");
    await expect
      .element(screen.getByRole("button", { name: "Statement month" }))
      .toHaveTextContent("August 2026");
  });

  test("steps a year, and disables the months past its latest", async () => {
    const screen = await render(
      <StatementField defaultValue={month("2026-10")} max={month("2026-11")} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Statement month" }));
    await expect.element(page.getByRole("button", { name: "Dec 2026" })).toBeDisabled();
    await userEvent.click(page.getByRole("button", { name: "Previous year" }));
    await expect.element(page.getByRole("button", { name: "Dec 2025" })).toBeEnabled();
  });
});
