/* The numbers and dates family, the firm's own components: Num, Money, Pct, Bps, Price32 and DateTime, which show
 * values by parallax's rules so a number reads the same here as in the grid; AmountInput; AsOfDatePicker and
 * DateRangePicker on the SIFMA calendar; and a ticket on TanStack Form that uses them. Each section's module is under
 * numbers-and-dates/, with its tests beside it. */

import type { ReactElement } from "react";

import { AmountInputSection } from "./numbers-and-dates/amount-input.tsx";
import {
  AsOfDatePickerSection,
  DateRangePickerSection,
} from "./numbers-and-dates/date-pickers.tsx";
import {
  BpsSection,
  DateTimeSection,
  MoneySection,
  NumSection,
  PctSection,
  Price32Section,
  SignedSection,
} from "./numbers-and-dates/display.tsx";
import { TicketFormSection } from "./numbers-and-dates/ticket-form.tsx";

function NumbersAndDates(): ReactElement {
  return (
    <div className="flex flex-col gap-8">
      <NumSection />
      <MoneySection />
      <PctSection />
      <BpsSection />
      <Price32Section />
      <DateTimeSection />
      <SignedSection />
      <AmountInputSection />
      <AsOfDatePickerSection />
      <DateRangePickerSection />
      <TicketFormSection />
    </div>
  );
}

export { NumbersAndDates };
