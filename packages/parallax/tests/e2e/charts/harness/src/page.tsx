/* The harness page the address asks for, in its `page` parameter: `charts`, `technical` or `breakdowns`. */

import type { ReactNode } from "react";

import { BreakdownsPage } from "./breakdowns.tsx";
import { ChartsPage } from "./charts.tsx";
import { TechnicalPage } from "./technical.tsx";

/** The page `name` names, the charts page by default. */
function Page({ name }: { readonly name: string | null }): ReactNode {
  switch (name ?? "charts") {
    case "technical": {
      return <TechnicalPage />;
    }
    case "breakdowns": {
      return <BreakdownsPage />;
    }
    default: {
      return <ChartsPage />;
    }
  }
}

export { Page };
