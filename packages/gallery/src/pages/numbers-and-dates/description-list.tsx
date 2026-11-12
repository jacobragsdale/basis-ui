/* DescriptionList on the numbers and dates page: a bond's terms, two columns of facts beside their terms, and an
 * order's notes, each term above its value. */

import { DateTime, DescriptionList, Money, Pct, Price32 } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

function DescriptionListSection(): ReactElement {
  return (
    <Section
      title="DescriptionList"
      description="A detail page's facts, each term in the muted colour beside its value, in one column or several, or above it for long values."
    >
      <DescriptionList
        aria-label="Bond terms"
        columns={2}
        className="max-w-3xl"
        items={[
          { description: "UST 4.125% 05/15/2036", term: "Security" },
          { description: <Pct value={0.04125} decimals={3} />, term: "Coupon" },
          { description: <DateTime value="2036-05-15" />, term: "Maturity" },
          { description: <Price32 value={99.515625} />, term: "Price" },
          {
            description: <Money value={42_000_000_000} currency="USD" abbreviate="B" />,
            term: "Outstanding",
          },
          { description: "30/360, semi-annual", term: "Convention" },
        ]}
      />
      <DescriptionList
        aria-label="Order notes"
        layout="above"
        className="max-w-md"
        items={[
          {
            description:
              "Allocated across three funds pro rata to their target weights, after the 4:00 p.m. close.",
            term: "Allocation",
          },
          { description: "Settles T+1 through the custodian's DVP account.", term: "Settlement" },
        ]}
      />
    </Section>
  );
}

export { DescriptionListSection };
