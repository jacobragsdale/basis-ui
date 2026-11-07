/* AsOfDatePicker and DateRangePicker, closed, as the gallery shows every popup; the tests open them. Today is fixed
 * at 2026-11-12, so the pages look the same every day (example-today.ts). */

import {
  AsOfDatePicker,
  DateRangePicker,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@basis/ui";
import { nyse } from "@basis/ui/dates";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { exampleToday } from "./example-today.ts";

function AsOfDatePickerSection(): ReactElement {
  return (
    <Section
      title="AsOfDatePicker"
      description="An as-of date: typed, or picked from a month grid that marks closed days and early closes. It takes business days on its calendar, SIFMA's by default, and starts at the last business day before today."
    >
      <FieldGroup className="max-w-sm">
        <Field>
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

function DateRangePickerSection(): ReactElement {
  return (
    <Section
      title="DateRangePicker"
      description="A range of business days, with presets for month, quarter and year to date and the period before, each ending on a business day."
    >
      <FieldGroup className="max-w-sm">
        <Field>
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

export { AsOfDatePickerSection, DateRangePickerSection };
