/* Popover, Hover Card and Tooltip on the overlays and menus page: a popover of filters, a hover card that previews a
 * bond, and tooltips on a toolbar's icon buttons. */

import {
  Button,
  ButtonLink,
  DownloadIcon,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  RefreshCwIcon,
  SettingsIcon,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

/** A popover of filters, which moves focus into itself. */
function PopoverExample(): ReactElement {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>Filters</PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Filters</PopoverTitle>
          <PopoverDescription>Narrow the blotter to one desk and one day.</PopoverDescription>
        </PopoverHeader>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm">
            Reset
          </Button>
          <Button size="sm">Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const bond = [
  ["Coupon", "4.25%"],
  ["Maturity", "11/15/2034"],
  ["Yield", "4.31%"],
] as const;

/** A link to a bond, previewed by a hover card while the pointer rests on it or it has focus. */
function HoverCardExample(): ReactElement {
  return (
    <HoverCard>
      <HoverCardTrigger render={<ButtonLink variant="link" href="#hover-card" />}>
        UST 4.25% 2034
      </HoverCardTrigger>
      <HoverCardContent>
        <p className="font-medium">United States Treasury note</p>
        <dl className="mt-2 grid grid-cols-2 gap-1">
          {bond.map(([term, detail]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="text-right tabular-nums">{detail}</dd>
            </div>
          ))}
        </dl>
      </HoverCardContent>
    </HoverCard>
  );
}

const tools = [
  ["Refresh", RefreshCwIcon],
  ["Export", DownloadIcon],
  ["Settings", SettingsIcon],
] as const;

/** A toolbar of icon buttons, each named by its `aria-label` and labelled on sight by its tooltip. */
function TooltipExample(): ReactElement {
  return (
    <TooltipProvider>
      <div className="flex gap-1">
        {tools.map(([name, Icon]) => (
          <Tooltip key={name}>
            <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={name} />}>
              <Icon />
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

function PopupSections(): ReactElement {
  return (
    <>
      <Section
        title="Popover"
        description="A panel anchored to its trigger, for a short form. Focus moves into it and back to the trigger."
      >
        <div className="flex flex-wrap gap-2">
          <PopoverExample />
        </div>
      </Section>
      <Section
        title="Hover Card"
        description="A preview of what a link leads to, for sighted pointer and keyboard users. The link's page holds everything it shows."
      >
        <div>
          <HoverCardExample />
        </div>
      </Section>
      <Section
        title="Tooltip"
        description="A short visual label for a control. It names nothing, so an icon button still takes an aria-label."
      >
        <TooltipExample />
      </Section>
    </>
  );
}

export { HoverCardExample, PopoverExample, PopupSections, TooltipExample };
