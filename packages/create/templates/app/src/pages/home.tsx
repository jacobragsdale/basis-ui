/* The app's first page. Replace it with the app's own, calling the API through the generated client once
 * `vp run client-pull` has copied the API's document. */

import { Card, CardContent, CardDescription, CardHeader, CardTitle, TypographyH1 } from "@basis/ui";
import type { ReactElement } from "react";

function HomePage(): ReactElement {
  return (
    <>
      <TypographyH1>Home</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>Start here</CardTitle>
          <CardDescription>
            Copy the API document with vp run client-pull, then build the pages of the app.
          </CardDescription>
        </CardHeader>
        <CardContent>AGENTS.md says how this repo is checked, run and pictured.</CardContent>
      </Card>
    </>
  );
}

export { HomePage };
