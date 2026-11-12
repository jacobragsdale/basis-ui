/* A bond's identifiers and dates as the showcase's API would give them: its ISIN from its CUSIP, its issue date from
 * its tenor, and its semiannual coupons on 30/360 from issue to maturity. */

/** Letters count from 10, A, in an ISIN's check digit, as base 36 reads them. */
const base36 = 36;
const decimal = 10;
const monthsInYear = 12;
const halfYear = 6;
const couponsPerYear = 2;
const per100 = 100;

/** An ISIN for a US CUSIP: `US`, the CUSIP, and the check digit of the Luhn algorithm over its digits. */
function isinOf(cusip: string): string {
  const body = `US${cusip}`;
  const digits = Array.from(body.split(""), (character) => Number.parseInt(character, base36)).join(
    "",
  );
  let sum = 0;
  for (const [index, character] of digits.split("").toReversed().entries()) {
    const value = Number(character) * (index % 2 === 0 ? 2 : 1);
    sum += Math.floor(value / decimal) + (value % decimal);
  }
  return `${body}${String((decimal - (sum % decimal)) % decimal)}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** Six months before `date`, as `YYYY-MM-DD`, on the same day of the month. */
function halfYearBefore(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const back = month - halfYear;
  const shifted =
    back <= 0 ? { month: back + monthsInYear, year: year - 1 } : { month: back, year };
  return `${String(shifted.year)}-${twoDigits(shifted.month)}-${twoDigits(day)}`;
}

/** When a bond maturing on `maturity` was issued: its tenor bucket's years before, such as 10 for `10Y`, or the years
 * it has left, rounded up, where that is longer. */
function issuedOf(maturity: string, bucket: string, yearsLeft: number): string {
  const years = Number.parseInt(bucket, decimal);
  const term = Number.isNaN(years) ? Math.ceil(yearsLeft) : Math.max(years, Math.ceil(yearsLeft));
  const [year = "0", ...rest] = maturity.split("-");
  return [String(Number(year) - term), ...rest].join("-");
}

/** The coupons from issue to maturity, semiannual on 30/360, each its accrual's start, its payment and its amount. */
function couponsOf(
  maturity: string,
  issued: string,
  rate: number,
): Readonly<Record<string, unknown>>[] {
  const payments: string[] = [];
  for (let payment = maturity; payment > issued; payment = halfYearBefore(payment)) {
    payments.push(payment);
  }
  return payments.toReversed().map((payment) => {
    const start = halfYearBefore(payment);
    return {
      accrual_start: start < issued ? issued : start,
      amount_per_100: (rate * per100) / couponsPerYear,
      payment_date: payment,
      rate,
    };
  });
}

export { couponsOf, isinOf, issuedOf };
