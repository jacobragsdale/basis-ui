import "#styles.css";

import { DatePicker, Field, FieldLabel } from "@basis/ui";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { day, focusIsOn } from "./test-helpers.ts";

const today = Temporal.PlainDate.from("2026-11-12");

/** A DatePicker in a Field, labelled "Maturity". */
function MaturityField(props: Partial<ComponentProps<typeof DatePicker>>): ReactElement {
  return (
    <Field>
      <FieldLabel htmlFor="maturity">Maturity</FieldLabel>
      <DatePicker id="maturity" today={today} {...props} />
    </Field>
  );
}

describe("DatePicker", () => {
  test("starts empty, and its grid opens on today", async () => {
    const screen = await render(<MaturityField />);
    await expect.element(screen.getByRole("textbox", { name: "Maturity" })).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Choose a date" }));
    await focusIsOn(day("Thursday, November 12, 2026"));
  });

  test("takes a weekend, a holiday or a date years ahead, typed", async () => {
    const onValueChange = vi.fn<(next: Temporal.PlainDate | null) => void>();
    const screen = await render(<MaturityField onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "Maturity" });
    await userEvent.fill(input, "11/15/2036");
    await userEvent.keyboard("{Enter}");
    await expect.element(input).toHaveValue("2036-11-15");
    await userEvent.fill(input, "2026-11-11");
    await userEvent.tab();
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    expect(onValueChange.mock.calls.map(([next]) => next?.toString())).toStrictEqual([
      "2036-11-15",
      "2026-11-11",
    ]);
  });

  test("picks a holiday from the grid, which still marks it closed", async () => {
    const onValueChange = vi.fn<(next: Temporal.PlainDate | null) => void>();
    const screen = await render(<MaturityField onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Choose a date" }));
    const holiday = page.getByRole("gridcell", { name: /^Wednesday, November 11, 2026, closed/u });
    await userEvent.click(holiday);
    expect(onValueChange.mock.lastCall?.[0]?.toString()).toBe("2026-11-11");
  });

  test("holds its earliest date", async () => {
    const screen = await render(<MaturityField min={today} />);
    const input = screen.getByRole("textbox", { name: "Maturity" });
    await userEvent.fill(input, "2026-11-01");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("2026-11-01 is before 2026-11-12, the earliest date this field takes.");
  });
});
