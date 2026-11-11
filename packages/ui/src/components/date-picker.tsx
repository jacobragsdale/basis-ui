/* DatePicker: any date, such as a maturity, a trade date or a birthday, on the single-date field (date-field.tsx). It
 * takes any day, weekends and holidays too, with no bounds unless it sets them; its grid still marks the days the
 * market closes on its calendar, SIFMA's unless it names another, and starts at no date. */

import type { ReactElement } from "react";

import { sifma } from "#dates/sifma.ts";

import { DateField } from "./date-field.tsx";
import type { DateFieldBehaviour, DateFieldProps } from "./date-field.tsx";
import { pickRules } from "./date-picking.ts";

/** A date field's props: the single-date field's, with no latest date and no value unless set. */
type DatePickerProps = DateFieldProps;

const anyDate: DateFieldBehaviour = {
  initialFor: () => null,
  rulesFor: ({ calendar = sifma, max = null, min }, today) =>
    pickRules({ anyDay: true, calendar, max, min, today }),
  startFor: (_calendar, today) => today,
};

/** A date field for any day. Label it with a FieldLabel's `htmlFor` and this `id`, and put it in a `Field`.
 *
 * @use For a date that need not be a business day, such as a bond's maturity or a trade date. For the date a page's
 * data is as of, use AsOfDatePicker; for a month, MonthPicker; for a period, DateRangePicker.
 * @see Field, FieldLabel, AsOfDatePicker, MonthPicker, DateRangePicker
 *
 * @example
 * ```tsx
 * import { DatePicker, Field, FieldLabel } from "@basis/ui";
 *
 * <Field>
 *   <FieldLabel htmlFor="maturity">Maturity</FieldLabel>
 *   <DatePicker id="maturity" min={Temporal.PlainDate.from("2026-11-11")} />
 * </Field>;
 * ```
 */
function DatePicker(props: DatePickerProps): ReactElement {
  return <DateField behaviour={anyDate} {...props} />;
}

export { DatePicker };
export type { DatePickerProps };
