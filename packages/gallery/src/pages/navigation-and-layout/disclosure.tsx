/* Accordion and Collapsible on the navigation and layout page: sections that open and close. */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  ChevronsUpDownIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { Demo } from "./demo.tsx";

const fills = [
  "10:02  5 million at 99-16",
  "10:41  10 million at 99-17+",
  "11:15  2 million at 99-18",
];

/** Three questions about a trade, the first open and the last disabled. */
function TradeAccordion({ multiple = false }: { readonly multiple?: boolean }): ReactElement {
  return (
    <Accordion defaultValue={["settlement"]} multiple={multiple} className="max-w-md">
      <AccordionItem value="settlement">
        <AccordionTrigger>When does it settle?</AccordionTrigger>
        <AccordionContent>
          <p>T+1 on SIFMA&apos;s calendar, so a Friday trade settles on Monday.</p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="accrued">
        <AccordionTrigger>Who computes accrued interest?</AccordionTrigger>
        <AccordionContent>
          <p>
            The API, which holds the one day-count implementation.{" "}
            <a href="#day-counts">Read why</a>.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="allocation" disabled>
        <AccordionTrigger>How is it allocated?</AccordionTrigger>
        <AccordionContent>
          <p>By the order&apos;s accounts, once it is filled.</p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/** An order's fills: the first shown, the rest behind a trigger. */
function FillsCollapsible(): ReactElement {
  const [first, ...rest] = fills;
  return (
    <Collapsible className="w-80">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">Fills</p>
        <CollapsibleTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <ChevronsUpDownIcon />
          <span className="sr-only">Show every fill</span>
        </CollapsibleTrigger>
      </div>
      <p className="mt-2 rounded-md border px-3 py-2 font-mono text-sm">{first}</p>
      <CollapsibleContent>
        {rest.map((fill) => (
          <p key={fill} className="mt-2 rounded-md border px-3 py-2 font-mono text-sm">
            {fill}
          </p>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AccordionSection(): ReactElement {
  return (
    <Section
      title="Accordion"
      description="Sections opened by their headings, which are buttons in the tab order: Enter or Space toggles one. One opens at a time unless multiple is set."
    >
      <div className="flex flex-wrap items-start gap-10">
        <Demo label="one at a time, the last disabled">
          <TradeAccordion />
        </Demo>
        <Demo label="multiple">
          <TradeAccordion multiple />
        </Demo>
      </div>
    </Section>
  );
}

function CollapsibleSection(): ReactElement {
  return (
    <Section
      title="Collapsible"
      description="One section that shows and hides its content. Its trigger is a button, here a Button through render."
    >
      <FillsCollapsible />
    </Section>
  );
}

export { AccordionSection, CollapsibleSection, FillsCollapsible, TradeAccordion };
