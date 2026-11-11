/* AsOfDatePicker: the date a page's data is as of, on the single-date field (date-field.tsx). It names its calendar,
 * SIFMA's unless it names another, and takes its business days only, up to today in New York unless it sets other
 * bounds. It starts at the last business day before today, the last close whose data is complete. */

import type { ReactElement } from "react";

import { sifma } from "#dates/sifma.ts";

import { DateField } from "./date-field.tsx";
import type { DateFieldBehaviour, DateFieldProps } from "./date-field.tsx";
import { defaultAsOfDate, pickRules } from "./date-picking.ts";

/** An as-of date field's props: the single-date field's, whose `max` is today unless set and whose `defaultValue` is
 * the last business day before today unless set. */
type AsOfDatePickerProps = DateFieldProps;

const asOf: DateFieldBehaviour = {
  initialFor: (calendar, today) => defaultAsOfDate({ calendar: calendar ?? sifma, today }),
  rulesFor: ({ calendar = sifma, max, min }, today) => pickRules({ calendar, max, min, today }),
  startFor: (calendar, today) => defaultAsOfDate({ calendar: calendar ?? sifma, today }),
};

/** An as-of date field. Label it with a FieldLabel's `htmlFor` and this `id`, and put it in a `Field`.
 *
 * @use For the business day a page's data is as of. For any other date, such as a maturity, use DatePicker; for a
 * period, DateRangePicker.
 * @see Field, FieldLabel, DatePicker, DateRangePicker, defaultAsOfDate, sifma
 *
 * @example
 * ```tsx
 * import { AsOfDatePicker, Field, FieldLabel } from "@basis/ui";
 *
 * <Field>
 *   <FieldLabel htmlFor="as-of">As of</FieldLabel>
 *   <AsOfDatePicker id="as-of" defaultValue={Temporal.PlainDate.from("2026-11-06")} />
 * </Field>;
 * ```
 */
function AsOfDatePicker(props: AsOfDatePickerProps): ReactElement {
  return <DateField behaviour={asOf} {...props} />;
}

export { AsOfDatePicker };
export type { AsOfDatePickerProps };
