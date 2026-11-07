/* The demo's two tools, the performance overlay and the theme studio, which the sidebar opens over any page. */

import { createContext, use } from "react";

interface Tools {
  /** Whether the performance overlay is shown. */
  readonly performance: boolean;
  readonly handlePerformance: () => void;
  /** Whether the theme studio is open. */
  readonly studio: boolean;
  readonly handleStudio: (open: boolean) => void;
}

const ToolsContext = createContext<Tools | null>(null);

/** The tools' state, which the demo's layout holds. */
function useTools(): Tools {
  const tools = use(ToolsContext);
  if (tools === null) {
    throw new Error("useTools is used outside the demo's layout, which holds the tools' state.");
  }
  return tools;
}

export { ToolsContext, useTools };
export type { Tools };
