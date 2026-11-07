/* Typography on the feedback and display page: every text component, in the order a desk's morning note uses them. */

import {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLead,
  TypographyList,
  TypographyMuted,
  TypographyP,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

function TypographySection(): ReactElement {
  return (
    <Section
      title="Typography"
      description="Headings, paragraphs, lists and inline code on the theme's type scale, so no app styles text by hand."
    >
      <div className="flex max-w-2xl flex-col gap-3">
        <TypographyH1>Rates desk: morning note</TypographyH1>
        <TypographyLead>
          Positions, risk and the day’s calendar, as of the overnight close.
        </TypographyLead>
        <TypographyH2>Overnight</TypographyH2>
        <TypographyP>
          Treasuries rallied after the payrolls report, and the curve bull-steepened. The desk’s{" "}
          <TypographyInlineCode>UST10Y</TypographyInlineCode> position gained most.
        </TypographyP>
        <TypographyH3>Risk</TypographyH3>
        <TypographyList>
          <li>DV01 is within its limit, at 92%.</li>
          <li>No position breaches its concentration limit.</li>
          <li>Two trades from yesterday are still unsettled.</li>
        </TypographyList>
        <TypographyH4>Calendar</TypographyH4>
        <TypographyMuted>SIFMA recommends a 2:00 p.m. close tomorrow.</TypographyMuted>
      </div>
    </Section>
  );
}

export { TypographySection };
