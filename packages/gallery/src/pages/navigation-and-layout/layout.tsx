/* Scroll Area, Separator and Aspect Ratio on the navigation and layout page. */

import { AspectRatio, ScrollArea, ScrollBar, Separator } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { Demo } from "./demo.tsx";

const trancheCount = 40;
const tranches = Array.from(
  { length: trancheCount },
  (_value, index) => `Tranche ${String(index + 1).padStart(2, "0")}`,
);
// A widescreen box's width and height.
const wideWidth = 16;
const wideHeight = 9;
const tenors = ["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"] as const;

/** Forty tranches in a box 48 units tall, which scrolls them. */
function TrancheList(): ReactElement {
  return (
    <div className="w-56 overflow-hidden rounded-lg border">
      <ScrollArea className="h-48">
        <ul className="flex flex-col p-3 text-sm">
          {tranches.map((tranche) => (
            <li key={tranche} className="border-b py-1.5 last:border-b-0">
              {tranche}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

/** The curve's tenors in a row wider than its box, with a horizontal scrollbar. */
function TenorStrip(): ReactElement {
  return (
    <div className="w-72 overflow-hidden rounded-lg border">
      <ScrollArea>
        <ul className="flex w-max gap-2 p-3">
          {tenors.map((tenor) => (
            <li key={tenor} className="w-16 rounded-md bg-muted py-6 text-center font-mono text-sm">
              {tenor}
            </li>
          ))}
        </ul>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

function ScrollAreaSection(): ReactElement {
  return (
    <Section
      title="Scroll Area"
      description="A region that scrolls what overflows it, with a thin scrollbar of the theme's own. It takes focus, so the keyboard scrolls it."
    >
      <div className="flex flex-wrap items-start gap-10">
        <Demo label="vertical">
          <TrancheList />
        </Demo>
        <Demo label="horizontal">
          <TenorStrip />
        </Demo>
      </div>
    </Section>
  );
}

/** A heading and a row of labels, split by separators. */
function SeparatedLabels(): ReactElement {
  return (
    <div className="flex w-72 flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1">
        <p className="font-medium">Rates desk</p>
        <p className="text-muted-foreground">Treasuries and swaps</p>
      </div>
      <Separator />
      <div className="flex h-5 items-center gap-3">
        <span>Positions</span>
        <Separator orientation="vertical" />
        <span>History</span>
        <Separator orientation="vertical" />
        <span>Reports</span>
      </div>
    </div>
  );
}

function SeparatorSection(): ReactElement {
  return (
    <Section
      title="Separator"
      description="A line between groups of content, horizontal by default, announced as a separator."
    >
      <SeparatedLabels />
    </Section>
  );
}

function AspectRatioSection(): ReactElement {
  return (
    <Section
      title="Aspect Ratio"
      description="A box whose height follows its width at a ratio, for media and charts of a fixed shape."
    >
      <div className="flex flex-wrap items-start gap-10">
        <Demo label="16 / 9">
          <div className="w-64">
            <AspectRatio ratio={wideWidth / wideHeight}>
              <div className="flex size-full items-center justify-center rounded-lg bg-muted text-sm">
                16 : 9
              </div>
            </AspectRatio>
          </div>
        </Demo>
        <Demo label="1 / 1">
          <div className="w-32">
            <AspectRatio ratio={1}>
              <div className="flex size-full items-center justify-center rounded-lg bg-muted text-sm">
                1 : 1
              </div>
            </AspectRatio>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

export {
  AspectRatioSection,
  ScrollAreaSection,
  SeparatedLabels,
  SeparatorSection,
  TenorStrip,
  TrancheList,
};
