/* Alert on the feedback and display page: every variant with its icon, title and description, then one without an
 * icon and one with an action. */

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  Button,
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

const examples = [
  {
    variant: "default",
    Icon: InfoIcon,
    title: "Prices are end of day",
    description: "Marks are from yesterday's 4:00 p.m. close until the morning run finishes.",
  },
  {
    variant: "success",
    Icon: CircleCheckIcon,
    title: "Settlement confirmed",
    description: "All 42 trades for today settled with the custodian.",
  },
  {
    variant: "warning",
    Icon: TriangleAlertIcon,
    title: "Approaching the DV01 limit",
    description: "The desk is at 92% of its DV01 limit. New risk needs a second approval.",
  },
  {
    variant: "info",
    Icon: InfoIcon,
    title: "Early close tomorrow",
    description: "SIFMA recommends a 2:00 p.m. close for US bond markets.",
  },
  {
    variant: "destructive",
    Icon: OctagonXIcon,
    title: "Pricing feed is down",
    description: "Prices on this page have not updated since 10:42 a.m.",
  },
] as const;

function AlertSection(): ReactElement {
  return (
    <Section
      title="Alert"
      description="A callout for a status the page is in. Destructive and warning alerts interrupt a screen reader; the rest wait their turn."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {examples.map(({ variant, Icon, title, description }) => (
          <Alert key={variant} variant={variant}>
            <Icon />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{description}</AlertDescription>
          </Alert>
        ))}
        <Alert>
          <AlertTitle>No icon</AlertTitle>
          <AlertDescription>
            Without an icon, the text takes the alert’s full width.
          </AlertDescription>
        </Alert>
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>Unsaved changes</AlertTitle>
          <AlertDescription>The limits you edited are not saved yet.</AlertDescription>
          <AlertAction>
            <Button size="xs" variant="outline">
              Save
            </Button>
          </AlertAction>
        </Alert>
      </div>
    </Section>
  );
}

export { AlertSection };
