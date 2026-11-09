import "#styles.css";

import { DateRangePicker, Field, FieldLabel } from "@basis/ui";
import type { DateRangePreset } from "@basis/ui";
import type { DateRange } from "@basis/ui/dates";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { day, focusIsOn, inCompactDensity, keysTo, withToday } from "./test-helpers.ts";

const date = (text: string): Temporal.PlainDate => Temporal.PlainDate.from(text);
/** The tests' today: Thursday, the day after Veterans Day, so the presets run to Tuesday 2026-11-10. */
const today = date("2026-11-12");

/** A DateRangePicker in a Field, labelled "Period". */
function PeriodField(props: Partial<ComponentProps<typeof DateRangePicker>>): ReactElement {
  return (
    <Field>
      <FieldLabel htmlFor="period">Period</FieldLabel>
      <DateRangePicker id="period" today={today} {...props} />
    </Field>
  );
}

/** The ranges a change handler heard, as text. */
function heard(onValueChange: {
  readonly mock: { readonly calls: (readonly [DateRange])[] };
}): string[] {
  return onValueChange.mock.calls.map(
    ([range]) => `${range.start.toString()} – ${range.end.toString()}`,
  );
}

describe("DateRangePicker", () => {
  test("is a button named by its label, described by its range, which opens a dialog", async () => {
    const screen = await render(<PeriodField />);
    const trigger = screen.getByRole("button", { name: "Period" });
    await expect.element(trigger).toHaveAccessibleDescription("Pick a range");
    await expect.element(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.click(trigger);
    await expect.element(page.getByRole("dialog", { name: "Choose a date range" })).toBeVisible();
    await focusIsOn(day("Tuesday, November 10, 2026"));
  });

  test.each([
    { end: "2026-11-10", label: "Month to date", start: "2026-11-02" },
    { end: "2026-11-10", label: "Quarter to date", start: "2026-10-01" },
    { end: "2026-11-10", label: "Year to date", start: "2026-01-02" },
    { end: "2026-10-30", label: "Prior month", start: "2026-10-01" },
    { end: "2026-09-30", label: "Prior quarter", start: "2026-07-01" },
    { end: "2025-12-31", label: "Prior year", start: "2025-01-02" },
  ])("$label runs from $start to $end, a business day", async ({ end, label, start }) => {
    const onValueChange = vi.fn<(range: DateRange) => void>();
    const screen = await render(<PeriodField onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Period" }));
    const dialog = page.getByRole("dialog", { name: "Choose a date range" });
    await userEvent.click(dialog.getByRole("button", { name: label }));
    await expect.element(dialog).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Period" }))
      .toHaveAccessibleDescription(`${start} – ${end}`);
    expect(heard(onValueChange)).toStrictEqual([`${start} – ${end}`]);
  });

  test("offers only the presets it is given", async () => {
    const presets: DateRangePreset[] = ["month-to-date", "prior-month"];
    const screen = await render(<PeriodField presets={presets} />);
    await userEvent.click(screen.getByRole("button", { name: "Period" }));
    const dialog = page.getByRole("dialog", { name: "Choose a date range" });
    await expect.element(dialog.getByRole("button", { name: "Month to date" })).toBeVisible();
    await expect.element(dialog.getByRole("button", { name: "Prior month" })).toBeVisible();
    await expect
      .element(dialog.getByRole("button", { name: "Year to date" }))
      .not.toBeInTheDocument();
  });

  test("the keys cross into the month before, and two picks make a range", async () => {
    const onValueChange = vi.fn<(range: DateRange) => void>();
    const screen = await render(<PeriodField onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Period" }));
    await keysTo("{Enter}", "Tuesday, November 10, 2026");
    await expect
      .element(day("Tuesday, November 10, 2026"))
      .toHaveAttribute("data-selected", "true");
    await keysTo("{ArrowUp}{ArrowUp}", "Tuesday, October 27, 2026", "October 2026");
    await userEvent.keyboard("{Enter}");
    expect(heard(onValueChange)).toStrictEqual(["2026-10-27 – 2026-11-10"]);
    await focusIsOn(screen.getByRole("button", { name: "Period" }));
  });

  test("days picked in either order make the range, and a holiday or weekend cannot be one end", async () => {
    const onValueChange = vi.fn<(range: DateRange) => void>();
    const screen = await render(<PeriodField onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Period" }));
    await userEvent.click(day("Monday, November 9, 2026"));
    await userEvent.click(day("Wednesday, November 11, 2026, closed: Veterans Day"), {
      force: true,
    });
    await userEvent.click(day("Sunday, November 8, 2026, closed: Weekend"), { force: true });
    expect(onValueChange).not.toHaveBeenCalled();
    await userEvent.click(day("Tuesday, November 3, 2026"));
    expect(heard(onValueChange)).toStrictEqual(["2026-11-03 – 2026-11-09"]);
  });

  test("shows its range inside the grid when reopened", async () => {
    const screen = await render(
      <PeriodField defaultValue={{ end: date("2026-11-06"), start: date("2026-11-02") }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Period" }));
    await expect.element(day("Monday, November 2, 2026")).toHaveAttribute("data-selected", "true");
    await expect
      .element(day("Wednesday, November 4, 2026"))
      .toHaveAttribute("data-in-range", "true");
    await expect.element(day("Friday, November 6, 2026")).toHaveAttribute("data-selected", "true");
    await focusIsOn(day("Friday, November 6, 2026"));
  });

  test("counts its presets from the day it opens, not the day it was first drawn", async () => {
    // Drawn on Thursday the 12th, opened the Tuesday after, a tab left open over the weekend.
    await withToday("2026-11-12", async (moveTo) => {
      const onValueChange = vi.fn<(range: DateRange) => void>();
      const screen = await render(
        <Field>
          <FieldLabel htmlFor="period">Period</FieldLabel>
          <DateRangePicker id="period" onValueChange={onValueChange} />
        </Field>,
      );
      moveTo("2026-11-17");
      await userEvent.click(screen.getByRole("button", { name: "Period" }));
      await focusIsOn(day("Monday, November 16, 2026"));
      const dialog = page.getByRole("dialog", { name: "Choose a date range" });
      await userEvent.click(dialog.getByRole("button", { name: "Month to date" }));
      expect(heard(onValueChange)).toStrictEqual(["2026-11-02 – 2026-11-16"]);
    });
  });

  test("stays at least 24 px tall in the compact density, and its days 24 px square", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<PeriodField />);
      const trigger = screen.getByRole("button", { name: "Period" });
      expect(trigger.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
      await userEvent.click(trigger);
      // The popup scales up as it opens, so the size is read once it has settled.
      await expect
        .poll(() => {
          const box = day("Tuesday, November 10, 2026").element().getBoundingClientRect();
          return Math.min(box.width, box.height);
        })
        .toBe(24);
    });
  });
});
