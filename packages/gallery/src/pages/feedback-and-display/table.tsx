/* Table on the feedback and display page: a desk's top positions, its numbers right-aligned in tabular figures, a
 * signed day's P&L in the gain and loss colours, one row selected, and a totals footer. */

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

interface Position {
  readonly security: string;
  readonly cusip: string;
  readonly par: string;
  readonly price: string;
  readonly yieldPct: string;
  readonly pnl: string;
  readonly gain: boolean;
}

// Made-up positions for the gallery, with the CUSIPs in the shape of real ones.
const positions: readonly Position[] = [
  {
    security: "UST 4.250% 11/15/2034",
    cusip: "91282CLW9",
    par: "25,000",
    price: "99.5000",
    yieldPct: "4.312",
    pnl: "+18,750",
    gain: true,
  },
  {
    security: "UST 3.875% 08/15/2033",
    cusip: "91282CHT1",
    par: "10,000",
    price: "97.1250",
    yieldPct: "4.268",
    pnl: "+4,200",
    gain: true,
  },
  {
    security: "Example County GO 5.000% 2041",
    cusip: "000000AA1",
    par: "3,500",
    price: "108.2500",
    yieldPct: "3.904",
    pnl: "−1,050",
    gain: false,
  },
];

function TableSection(): ReactElement {
  return (
    <Section
      title="Table"
      description="A small table for a few rows. Numeric columns align right in tabular figures, so digits line up by place."
    >
      <Table>
        <TableCaption>Top positions by par, in thousands, as of the 4:00 p.m. close.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Security</TableHead>
            <TableHead>CUSIP</TableHead>
            <TableHead variant="numeric">Par</TableHead>
            <TableHead variant="numeric">Price</TableHead>
            <TableHead variant="numeric">Yield</TableHead>
            <TableHead variant="numeric">Day P&amp;L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position, index) => (
            <TableRow key={position.cusip} data-state={index === 1 ? "selected" : undefined}>
              <TableCell>{position.security}</TableCell>
              <TableCell>{position.cusip}</TableCell>
              <TableCell variant="numeric">{position.par}</TableCell>
              <TableCell variant="numeric">{position.price}</TableCell>
              <TableCell variant="numeric">{position.yieldPct}</TableCell>
              <TableCell variant="numeric">
                <span className={position.gain ? "text-gain" : "text-loss"}>{position.pnl}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell variant="numeric">38,500</TableCell>
            <TableCell colSpan={2} />
            <TableCell variant="numeric">
              <span className="text-gain">+21,900</span>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Section>
  );
}

export { TableSection };
