/* The display components, each with a table of values as an API sends them and as the component shows them, by
 * parallax's rules; then signed values, and figures aligned to the right outside a table. */

import {
  Bps,
  DateTime,
  Money,
  Num,
  Pct,
  Price32,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TypographyInlineCode,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

/** A value as sent, and the component that shows it. */
interface Example {
  readonly sent: string;
  readonly shown: ReactElement;
}

/** Each value as sent beside what the component shows, in a numeric column. */
function Examples({
  label,
  examples,
}: {
  readonly label: string;
  readonly examples: readonly Example[];
}): ReactElement {
  return (
    <Table aria-label={label} className="max-w-xl">
      <TableHeader>
        <TableRow>
          <TableHead>Sent</TableHead>
          <TableHead variant="numeric">Shown</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {examples.map(({ sent, shown }) => (
          <TableRow key={sent}>
            <TableCell>
              <TypographyInlineCode>{sent}</TypographyInlineCode>
            </TableCell>
            <TableCell variant="numeric">{shown}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const numExamples: readonly Example[] = [
  { sent: '"1234.50"', shown: <Num value="1234.50" /> },
  { sent: "-1234.5", shown: <Num value={-1234.5} /> },
  { sent: "1234567n", shown: <Num value={1_234_567n} /> },
  { sent: '"1500000", abbreviate M', shown: <Num value="1500000" abbreviate="M" /> },
  { sent: '"-12.5", in parentheses', shown: <Num value="-12.5" negative="parentheses" /> },
  { sent: "null", shown: <Num value={null} /> },
];

const moneyExamples: readonly Example[] = [
  { sent: '"1234.5"', shown: <Money value="1234.5" /> },
  { sent: '"-1234.5"', shown: <Money value="-1234.5" /> },
  { sent: '"1234.5", EUR', shown: <Money value="1234.5" currency="EUR" /> },
  { sent: '"2500000000", abbreviate B', shown: <Money value="2500000000" abbreviate="B" /> },
  { sent: "null", shown: <Money value={null} /> },
];

const pctExamples: readonly Example[] = [
  { sent: '"0.0525"', shown: <Pct value="0.0525" /> },
  { sent: "-0.0012", shown: <Pct value={-0.0012} /> },
  { sent: '"5.25", in percent', shown: <Pct value="5.25" unit="percent" /> },
  { sent: "null", shown: <Pct value={null} /> },
];

const bpsExamples: readonly Example[] = [
  { sent: '"0.0025"', shown: <Bps value="0.0025" /> },
  { sent: '"-0.00125"', shown: <Bps value="-0.00125" /> },
  { sent: "125.5, in basis points", shown: <Bps value={125.5} unit="bp" /> },
  { sent: "null", shown: <Bps value={null} /> },
];

const priceExamples: readonly Example[] = [
  { sent: '"99.515625"', shown: <Price32 value="99.515625" /> },
  { sent: '"99.5078125"', shown: <Price32 value="99.5078125" /> },
  { sent: '"101.25"', shown: <Price32 value="101.25" /> },
  { sent: '"-0.140625"', shown: <Price32 value="-0.140625" /> },
  {
    sent: '"99.515625", in whole 32nds',
    shown: <Price32 value="99.515625" precision="thirty-seconds" />,
  },
  { sent: "null", shown: <Price32 value={null} /> },
];

const instant = "2026-11-06T14:30:00.123456Z";

const timeExamples: readonly Example[] = [
  { sent: `"${instant}"`, shown: <DateTime value={instant} /> },
  {
    sent: `"${instant}", milliseconds`,
    shown: <DateTime value={instant} precision="milliseconds" />,
  },
  { sent: `"${instant}", the date`, shown: <DateTime value={instant} show="date" /> },
  { sent: `"${instant}", London`, shown: <DateTime value={instant} zone="Europe/London" /> },
  { sent: '"2026-11-06"', shown: <DateTime value="2026-11-06" /> },
  { sent: '"2026-11-06T09:30:00", no zone', shown: <DateTime value="2026-11-06T09:30:00" /> },
  { sent: "null", shown: <DateTime value={null} /> },
];

const signedExamples: readonly Example[] = [
  { sent: 'Num "1250.5"', shown: <Num value="1250.5" signed /> },
  { sent: 'Money "-1234.5"', shown: <Money value="-1234.5" signed /> },
  { sent: "Pct 0.0003", shown: <Pct value={0.0003} signed /> },
  { sent: 'Bps "-0.0003"', shown: <Bps value="-0.0003" signed /> },
  { sent: 'Price32 "0.140625"', shown: <Price32 value="0.140625" signed /> },
  { sent: 'Num "0.001", 2 decimals', shown: <Num value="0.001" decimals={2} signed /> },
];

function NumSection(): ReactElement {
  return (
    <Section
      title="Num"
      description="A number by the formatter's defaults: a decimal at its own scale, an integer with none, a double with two."
    >
      <Examples label="Num examples" examples={numExamples} />
    </Section>
  );
}

function MoneySection(): ReactElement {
  return (
    <Section
      title="Money"
      description="An amount with its currency's symbol after the sign, at the currency's minor units unless abbreviated."
    >
      <Examples label="Money examples" examples={moneyExamples} />
    </Section>
  );
}

function PctSection(): ReactElement {
  return (
    <Section
      title="Pct"
      description="A rate as a percentage, at two decimals: a fraction unless the value is in percent."
    >
      <Examples label="Pct examples" examples={pctExamples} />
    </Section>
  );
}

function BpsSection(): ReactElement {
  return (
    <Section
      title="Bps"
      description="A rate in basis points: a fraction unless the value is in basis points already."
    >
      <Examples label="Bps examples" examples={bpsExamples} />
    </Section>
  );
}

function Price32Section(): ReactElement {
  return (
    <Section
      title="Price32"
      description="A Treasury price in 32nds: + is half a 32nd, and a third digit counts eighths of one."
    >
      <Examples label="Price32 examples" examples={priceExamples} />
    </Section>
  );
}

function DateTimeSection(): ReactElement {
  return (
    <Section
      title="DateTime"
      description="An instant in New York time unless another zone is named, a wall-clock time as stored, and a date as it is. Its title gives the full instant."
    >
      <Examples label="DateTime examples" examples={timeExamples} />
    </Section>
  );
}

/** Signed values, then a column of figures aligned right outside a table. */
function SignedSection(): ReactElement {
  return (
    <Section
      title="Signed and aligned"
      description="signed colours a gain and a loss and always writes the sign; zero takes neither. align end sets a column of figures to the right."
    >
      <Examples label="Signed examples" examples={signedExamples} />
      <dl aria-label="Position summary" className="grid w-72 grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Market value</dt>
        <dd>
          <Money value="10250000.5" align="end" />
        </dd>
        <dt className="text-muted-foreground">Yield</dt>
        <dd>
          <Pct value="0.04125" decimals={3} align="end" />
        </dd>
        <dt className="text-muted-foreground">Spread</dt>
        <dd>
          <Bps value="0.00875" align="end" />
        </dd>
      </dl>
    </Section>
  );
}

export {
  BpsSection,
  DateTimeSection,
  MoneySection,
  NumSection,
  PctSection,
  Price32Section,
  SignedSection,
};
