/* The feedback and display family: Badge so far, every variant, with each status shown by an icon and a word as well
 * as its colour. */

import {
  ArrowUpRightIcon,
  Badge,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "./section.tsx";

const plainVariants = ["default", "secondary", "outline", "ghost", "link"] as const;

function BadgeSection(): ReactElement {
  return (
    <Section
      title="Badge"
      description="A short label for a status or a count. A status badge pairs its colour with an icon and a word."
    >
      <div className="flex flex-wrap items-center gap-2">
        {plainVariants.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">
          <CircleCheckIcon data-icon="inline-start" />
          Settled
        </Badge>
        <Badge variant="warning">
          <CircleAlertIcon data-icon="inline-start" />
          Pending
        </Badge>
        <Badge variant="info">
          <InfoIcon data-icon="inline-start" />
          Indicative
        </Badge>
        <Badge variant="destructive">
          <CircleXIcon data-icon="inline-start" />
          Failed
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          render={
            <a href="#badge">
              Trades
              <ArrowUpRightIcon data-icon="inline-end" />
            </a>
          }
        />
        <Badge variant="secondary">12</Badge>
      </div>
    </Section>
  );
}

function FeedbackAndDisplay(): ReactElement {
  return <BadgeSection />;
}

export { FeedbackAndDisplay };
