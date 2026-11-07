import "#styles.css";

import { AsOfDatePicker, Field, FieldLabel } from "@basis/ui";
import { nyse } from "@basis/ui/dates";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { day, focusIsOn, keysTo } from "./test-helpers.ts";

const date = (text: string): Temporal.PlainDate => Temporal.PlainDate.from(text);
/** The tests' today: Thursday, the day after Veterans Day. */
const today = date("2026-11-12");

/** An AsOfDatePicker in a Field, labelled "As of". */
function AsOfField(props: Partial<ComponentProps<typeof AsOfDatePicker>>): ReactElement {
  return (
    <Field>
      <FieldLabel htmlFor="as-of">As of</FieldLabel>
      <AsOfDatePicker id="as-of" today={today} {...props} />
    </Field>
  );
}

/** Waits for the grid's dialog to close, the field to hold `value`, and focus to return to the calendar button. */
async function closedWith(dialog: Locator, value: string): Promise<void> {
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(page.getByRole("textbox", { name: "As of" })).toHaveValue(value);
  await focusIsOn(page.getByRole("button", { name: "Choose a date" }));
}

/** Opens the grid with the field's calendar button, and waits for focus to land in it. */
async function openGrid(): Promise<Locator> {
  await userEvent.click(page.getByRole("button", { name: "Choose a date" }));
  const dialog = page.getByRole("dialog", { name: "Choose a date" });
  await expect.element(dialog).toBeVisible();
  return dialog;
}

describe("AsOfDatePicker's default", () => {
  test.each([
    { calendar: "SIFMA's", expected: "2026-11-10", today: "2026-11-12", why: "over Veterans Day" },
    { calendar: "SIFMA's", expected: "2026-11-06", today: "2026-11-09", why: "over the weekend" },
    { calendar: "the NYSE's", expected: "2026-11-11", today: "2026-11-12", why: "on Veterans Day" },
  ])(
    "on $calendar calendar is the last business day before $today, $why",
    async ({ calendar, expected, today: from }) => {
      const screen = await render(
        <AsOfField today={date(from)} {...(calendar === "SIFMA's" ? {} : { calendar: nyse })} />,
      );
      await expect.element(screen.getByRole("textbox", { name: "As of" })).toHaveValue(expected);
    },
  );
});

describe("AsOfDatePicker's grid", () => {
  test("opens on the field's date, focused, in a dialog named for picking", async () => {
    await render(<AsOfField defaultValue={date("2026-10-30")} />);
    await openGrid();
    await expect.element(page.getByRole("grid", { name: "October 2026" })).toBeVisible();
    await focusIsOn(day("Friday, October 30, 2026"));
    await expect.element(day("Friday, October 30, 2026")).toHaveAttribute("tabindex", "0");
  });

  test("the arrow keys cross into the next month, and Enter picks the day", async () => {
    const onValueChange = vi.fn<(next: Temporal.PlainDate | null) => void>();
    await render(<AsOfField defaultValue={date("2026-10-30")} onValueChange={onValueChange} />);
    const dialog = await openGrid();
    await keysTo("{ArrowRight}", "Saturday, October 31, 2026, closed: Weekend");
    await keysTo("{ArrowRight}", "Sunday, November 1, 2026", "November 2026");
    await keysTo("{ArrowRight}", "Monday, November 2, 2026");
    await userEvent.keyboard("{Enter}");
    await closedWith(dialog, "2026-11-02");
    expect(onValueChange.mock.calls.map(([next]) => next?.toString())).toStrictEqual([
      "2026-11-02",
    ]);
  });

  test("Home and End keep to the week, PageUp and PageDown step a month, and Escape closes", async () => {
    await render(<AsOfField defaultValue={date("2026-11-04")} />);
    const dialog = await openGrid();
    await keysTo("{Home}", "Sunday, November 1, 2026");
    await keysTo("{End}", "Saturday, November 7, 2026");
    await keysTo("{PageUp}", "Wednesday, October 7, 2026", "October 2026");
    await keysTo("{Shift>}{PageUp}{/Shift}", "Tuesday, October 7, 2025");
    await keysTo("{ArrowUp}", "Tuesday, September 30, 2025", "September 2025");
    await userEvent.keyboard("{Escape}");
    await closedWith(dialog, "2026-11-04");
  });

  test("keys stop at the latest date, today unless set", async () => {
    await render(<AsOfField defaultValue={date("2026-11-10")} />);
    await openGrid();
    await keysTo("{PageDown}", "Thursday, November 12, 2026");
    await expect.element(page.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  test.each([
    { name: "Wednesday, November 11, 2026, closed: Veterans Day", what: "a SIFMA holiday" },
    { name: "Sunday, November 8, 2026, closed: Weekend", what: "a weekend" },
    { name: "Friday, November 13, 2026", what: "a day after today" },
  ])("$what is marked and cannot be picked", async ({ name }) => {
    const screen = await render(<AsOfField defaultValue={date("2026-11-10")} />);
    const dialog = await openGrid();
    await expect.element(day(name)).toHaveAttribute("aria-disabled", "true");
    // Playwright will not click a button marked disabled, so the click is forced, to show the grid ignores it.
    await userEvent.click(day(name), { force: true });
    await userEvent.keyboard("{Enter}");
    await expect.element(dialog).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "As of" })).toHaveValue("2026-11-10");
  });

  test("a holiday is struck through, an early close dotted, and the focused day's note given in words", async () => {
    await render(<AsOfField today={date("2026-12-01")} defaultValue={date("2026-11-25")} />);
    await openGrid();
    await expect
      .element(day("Thursday, November 26, 2026, closed: Thanksgiving Day"))
      .toHaveAttribute("data-market", "holiday");
    const early = day("Friday, November 27, 2026, closes early at 14:00: After Thanksgiving Day");
    await expect.element(early).toHaveAttribute("data-market", "early-close");
    await expect.element(early).not.toHaveAttribute("aria-disabled");
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(page.getByText("Closed: Thanksgiving Day", { exact: true })).toBeVisible();
  });
});

describe("AsOfDatePicker's typed dates", () => {
  test.each([
    {
      reason:
        "2026-11-11 is not a business day on the SIFMA (US bond market) calendar: it closes for Veterans Day.",
      typed: "2026-11-11",
    },
    {
      reason: "2026-11-08 is a Sunday, not a business day on the SIFMA (US bond market) calendar.",
      typed: "11/08/2026",
    },
    {
      reason: "2026-11-20 is after 2026-11-12, the latest date this field takes.",
      typed: "2026-11-20",
    },
    {
      reason: '"2026-02-30" is not a date: February 2026 has 28 days.',
      typed: "2026-02-30",
    },
  ])("$typed gets a clear reason and leaves no date", async ({ reason, typed }) => {
    const onValueChange = vi.fn<(next: Temporal.PlainDate | null) => void>();
    const screen = await render(<AsOfField onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "As of" });
    await userEvent.fill(input, typed);
    await userEvent.keyboard("{Enter}");
    await expect.element(screen.getByRole("alert")).toHaveTextContent(reason);
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await expect.element(input).toHaveAccessibleDescription(reason);
    await expect.element(input).toHaveValue(typed);
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  test("a business day typed in either form is taken when the field is left", async () => {
    const onValueChange = vi.fn<(next: Temporal.PlainDate | null) => void>();
    const screen = await render(<AsOfField onValueChange={onValueChange} />);
    const input = screen.getByRole("textbox", { name: "As of" });
    await userEvent.fill(input, "11/9/2026");
    await userEvent.tab();
    await expect.element(input).toHaveValue("2026-11-09");
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    expect(onValueChange.mock.lastCall?.[0]?.toString()).toBe("2026-11-09");
  });
});
