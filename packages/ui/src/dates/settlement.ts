/* Settlement dates: a trade settles a number of business days after its trade date, T+1 unless the caller says
 * otherwise, which is US Treasuries' and, since May 2024, US corporate bonds' and equities' cycle. */

import { addBusinessDays, businessDayOnOrAfter } from "./business-days.ts";
import type { CalendarOption } from "./business-days.ts";

interface SettlementOptions extends CalendarOption {
  /** Business days from the trade date to settlement: 0 for same-day, 1 (the default) for T+1, 2 for T+2. */
  readonly days?: number;
}

/** The date a trade made on `tradeDate` settles: `days` business days later on the calendar. Same-day settlement of
 * a trade dated on a closed day settles on the next business day. */
function settlementDate(
  tradeDate: Temporal.PlainDate,
  { calendar, days = 1 }: SettlementOptions = {},
): Temporal.PlainDate {
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new RangeError(
      `A settlement cycle is a whole number of days, 0 or more, not ${String(days)}.`,
    );
  }
  const options = calendar === undefined ? {} : { calendar };
  return days === 0
    ? businessDayOnOrAfter(tradeDate, options)
    : addBusinessDays(tradeDate, days, options);
}

export { settlementDate };
export type { SettlementOptions };
