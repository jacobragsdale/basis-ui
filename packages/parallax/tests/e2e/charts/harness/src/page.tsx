/* The harness page the address asks for, in its `page` parameter: `charts`, `technical`, `breakdowns` or
 * `fixed-income`. */

import type { ReactNode } from "react";

import { BreakdownsPage } from "./breakdowns.tsx";
import { ChartsPage } from "./charts.tsx";
import { FixedIncomePage } from "./fixed-income.tsx";
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
    case "fixed-income": {
      return <FixedIncomePage />;
    }
    default: {
      return <ChartsPage />;
    }
  }
}

export { Page };
