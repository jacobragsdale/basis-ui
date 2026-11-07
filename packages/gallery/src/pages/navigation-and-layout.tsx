/* The navigation and layout family: Card so far, at both sizes, with and without its optional parts. */

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "./section.tsx";

const cardSizes = ["default", "sm"] as const;

function CardSection(): ReactElement {
  return (
    <Section
      title="Card"
      description="A raised panel that groups one subject's content. size=sm tightens its spacing."
    >
      <div className="grid items-start gap-4 md:grid-cols-2">
        {cardSizes.map((size) => (
          <Card key={size} size={size}>
            <CardHeader>
              <CardTitle>Desk exposure</CardTitle>
              <CardDescription>As of the close, size {size}</CardDescription>
              <CardAction>
                <Badge variant="info">Indicative</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p>Net exposure is within the desk&apos;s limit for every sector.</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm">
                Open positions
              </Button>
            </CardFooter>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>A title and a description</CardTitle>
            <CardDescription>With no action, content or footer</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardContent>
            <p>Content alone, with no header or footer.</p>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function NavigationAndLayout(): ReactElement {
  return <CardSection />;
}

export { NavigationAndLayout };
