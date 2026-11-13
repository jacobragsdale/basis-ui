/* The app's first page. Replace it with the app's own once `vp run client-pull` has copied the API's document. */

import {
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Page,
} from "@basis/ui";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

function HomePage(): ReactElement {
  return (
    <Page title="Home">
      <Card>
        <CardHeader>
          <CardTitle>Start here</CardTitle>
          <CardDescription>
            This app runs on a sample: basis&apos;s example API, answered in fixture mode. Copy your
            API&apos;s document with vp run client-pull, then delete src/sample/, as AGENTS.md says.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <ButtonLink render={<Link to="/conventions" />} size="sm" variant="outline">
              Day count conventions
            </ButtonLink>
            <ButtonLink
              render={<Link to="/bonds/$security" params={{ security: "US91282CRF04" }} />}
              size="sm"
              variant="outline"
            >
              Bond US91282CRF04
            </ButtonLink>
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}

export { HomePage };
