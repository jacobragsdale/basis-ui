/* AsOfDatePicker, DatePicker, MonthPicker and DateRangePicker, closed, as the gallery shows every popup; the tests open
 * them. Today is fixed
 * at 2026-11-12, so the pages look the same every day (example-today.ts). */

import {
  AsOfDatePicker,
  DatePicker,
  DateRangePicker,
  MonthPicker,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@basis/ui";
import { nyse } from "@basis/ui/dates";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { openedByKeyboard } from "#pages/shot.ts";

import { exampleToday } from "./example-today.ts";

function AsOfDatePickerSection(): ReactElement {
  return (
    <Section
      title="AsOfDatePicker"
      description="An as-of date: typed, or picked from a month grid that marks closed days and early closes. It takes business days on its calendar, SIFMA's by default, and starts at the last business day before today."
    >
      <FieldGroup className="max-w-sm">
        <Field {...openedByKeyboard()}>
          <FieldLabel htmlFor="as-of-sifma">As of</FieldLabel>
          <AsOfDatePicker id="as-of-sifma" today={exampleToday} />
          <FieldDescription>
            SIFMA&apos;s calendar: Veterans Day is closed, so the default steps back to Tuesday.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="as-of-nyse">As of, on the NYSE</FieldLabel>
          <AsOfDatePicker id="as-of-nyse" calendar={nyse} today={exampleToday} />
          <FieldDescription>
            The NYSE trades on Veterans Day, so the default is that day.
          </FieldDescription>
        </Field>
        <Field data-disabled>
          <FieldLabel htmlFor="as-of-disabled">Disabled</FieldLabel>
          <AsOfDatePicker id="as-of-disabled" today={exampleToday} disabled />
        </Field>
      </FieldGroup>
    </Section>
  );
}

function DatePickerSection(): ReactElement {
  return (
    <Section
      title="DatePicker"
      description="Any date, such as a maturity: typed, or picked from a month grid that still marks the market's closed days. It takes weekends and holidays, and no bounds unless it sets them."
    >
      <FieldGroup className="max-w-sm">
        <Field {...openedByKeyboard()}>
          <FieldLabel htmlFor="maturity">Maturity</FieldLabel>
          <DatePicker
            id="maturity"
            today={exampleToday}
            min={exampleToday}
            defaultValue={Temporal.PlainDate.from("2036-11-15")}
          />
          <FieldDescription>A date after today; 15 November 2036 is a Saturday.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="trade-date">Trade date</FieldLabel>
          <DatePicker id="trade-date" today={exampleToday} />
        </Field>
      </FieldGroup>
    </Section>
  );
}

function MonthPickerSection(): ReactElement {
  return (
    <Section
      title="MonthPicker"
      description="A month, such as a statement's: a year and its twelve months, the arrow keys moving by a month or a quarter, months outside the bounds disabled."
    >
      <FieldGroup className="max-w-sm">
        <Field {...openedByKeyboard()}>
          <FieldLabel htmlFor="statement-month">Statement month</FieldLabel>
          <MonthPicker
            id="statement-month"
            defaultValue={Temporal.PlainYearMonth.from("2026-10")}
            max={Temporal.PlainYearMonth.from("2026-11")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="report-month">Report month</FieldLabel>
          <MonthPicker id="report-month" />
        </Field>
      </FieldGroup>
    </Section>
  );
}

function DateRangePickerSection(): ReactElement {
  return (
    <Section
      title="DateRangePicker"
      description="A range of business days, with presets for month, quarter and year to date, the period before and the past month, three months and year, each ending on a business day; a range typed From and To; and Clear."
    >
      <FieldGroup className="max-w-sm">
        <Field {...openedByKeyboard()}>
          <FieldLabel htmlFor="range-empty">Period</FieldLabel>
          <DateRangePicker id="range-empty" today={exampleToday} />
        </Field>
        <Field>
          <FieldLabel htmlFor="range-quarter">Quarter to date</FieldLabel>
          <DateRangePicker
            id="range-quarter"
            today={exampleToday}
            defaultValue={{
              end: Temporal.PlainDate.from("2026-11-10"),
              start: Temporal.PlainDate.from("2026-10-01"),
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="range-months">Months only</FieldLabel>
          <DateRangePicker
            id="range-months"
            today={exampleToday}
            presets={["month-to-date", "prior-month"]}
          />
        </Field>
      </FieldGroup>
    </Section>
  );
}

export { AsOfDatePickerSection, DatePickerSection, DateRangePickerSection, MonthPickerSection };
