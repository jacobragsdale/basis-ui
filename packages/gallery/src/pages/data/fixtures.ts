/* The data page's examples: Treasury positions, by real CUSIPs from TreasuryDirect with made-up books, sizes and
 * prices; issuers to search; and the securities a SecurityPicker finds. Prices and changes are decimal text, as an API
 * sends them, and one note starts with `=`, which the CSV export writes as text rather than a formula. */

import { cusipToIsin, parseCusip } from "@basis/ui/securities";

type Book = "Rates" | "Agency" | "Credit";

interface Position {
  readonly id: string;
  readonly cusip: string;
  readonly security: string;
  readonly book: Book;
  /** Par in dollars, as decimal text. */
  readonly par: string;
  readonly price: string;
  /** The day's change in price, in points. */
  readonly change: string;
  readonly settled: boolean;
  readonly note: string;
}

const positions: readonly Position[] = [
  {
    book: "Rates",
    change: "0.125",
    cusip: "91282CRV5",
    id: "rates-91282CRV5",
    note: "",
    par: "25000000.00",
    price: "100.40625",
    security: "UST 4.875% 10/31/2033",
    settled: true,
  },
  {
    book: "Rates",
    change: "-0.0625",
    cusip: "91282CRT0",
    id: "rates-91282CRT0",
    note: "On repo",
    par: "10000000.00",
    price: "99.96875",
    security: "UST 4.750% 10/31/2031",
    settled: true,
  },
  {
    book: "Rates",
    change: "0.03125",
    cusip: "91282CRU7",
    id: "rates-91282CRU7",
    note: "",
    par: "50000000.00",
    price: "100.015625",
    security: "UST 4.625% 10/31/2028",
    settled: false,
  },
  {
    book: "Rates",
    change: "-0.25",
    cusip: "91282CRF0",
    id: "rates-91282CRF0",
    note: '=HYPERLINK("https://example.com","Allocation")',
    par: "5000000.00",
    price: "99.515625",
    security: "UST 4.625% 08/15/2036",
    settled: true,
  },
  {
    book: "Agency",
    change: "0.09375",
    cusip: "91282CRQ6",
    id: "agency-91282CRQ6",
    note: "",
    par: "15000000.00",
    price: "100.828125",
    security: "UST 4.875% 10/15/2029",
    settled: true,
  },
  {
    book: "Agency",
    change: "0",
    cusip: "91282CRM5",
    id: "agency-91282CRM5",
    note: "Hedge for the agency book",
    par: "7500000.00",
    price: "101.25",
    security: "UST 5.000% 09/30/2033",
    settled: true,
  },
  {
    book: "Agency",
    change: "-0.15625",
    cusip: "91282CRN3",
    id: "agency-91282CRN3",
    note: "",
    par: "12000000.00",
    price: "100.9375",
    security: "UST 5.000% 09/30/2031",
    settled: false,
  },
  {
    book: "Agency",
    change: "0.0625",
    cusip: "91282CRP8",
    id: "agency-91282CRP8",
    note: "",
    par: "30000000.00",
    price: "100.125",
    security: "UST 4.750% 09/30/2028",
    settled: true,
  },
  {
    book: "Credit",
    change: "0.21875",
    cusip: "91282CRL7",
    id: "credit-91282CRL7",
    note: "",
    par: "2000000.00",
    price: "99.34375",
    security: "UST 4.375% 09/15/2029",
    settled: true,
  },
  {
    book: "Credit",
    change: "-0.03125",
    cusip: "91282CRJ2",
    id: "credit-91282CRJ2",
    note: "Duration hedge",
    par: "4000000.00",
    price: "99.6875",
    security: "UST 4.500% 08/31/2033",
    settled: true,
  },
  {
    book: "Credit",
    change: "0.0",
    cusip: "91282CRK9",
    id: "credit-91282CRK9",
    note: "",
    par: "6000000.00",
    price: "99.53125",
    security: "UST 4.375% 08/31/2031",
    settled: false,
  },
  {
    book: "Credit",
    change: "0.1875",
    cusip: "91282CRH6",
    id: "credit-91282CRH6",
    note: "",
    par: "8000000.00",
    price: "99.71875",
    security: "UST 4.125% 08/31/2028",
    settled: true,
  },
];

interface Issuer {
  readonly id: string;
  readonly name: string;
  readonly sector: string;
}

// Made-up issuers, named as the repo's placeholders are.
const issuers: readonly Issuer[] = [
  { id: "ust", name: "US Treasury", sector: "Government" },
  { id: "fnma", name: "Fannie Mae", sector: "Agency" },
  { id: "fhlmc", name: "Freddie Mac", sector: "Agency" },
  { id: "gnma", name: "Ginnie Mae", sector: "Agency" },
  { id: "fhlb", name: "Federal Home Loan Banks", sector: "Agency" },
  { id: "ewa", name: "Example Water Authority", sector: "Municipal" },
  { id: "pcc", name: "Placeholder County", sector: "Municipal" },
  { id: "sample", name: "Sample Utilities Co", sector: "Corporate" },
];

interface Security {
  readonly cusip: string;
  readonly isin: string;
  readonly description: string;
}

/** The positions' securities, each with the ISIN its CUSIP gives. */
const securities: readonly Security[] = positions.flatMap(({ cusip, security }) => {
  const reading = parseCusip(cusip);
  return reading.ok ? [{ cusip, description: security, isin: cusipToIsin(reading.value) }] : [];
});

export { issuers, positions, securities };
export type { Book, Issuer, Position, Security };
