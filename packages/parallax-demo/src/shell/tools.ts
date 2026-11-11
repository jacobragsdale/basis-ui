/* The demo's tool, the performance overlay, which the sidebar opens over any page. */

import { createContext, use } from "react";

interface Tools {
  /** Whether the performance overlay is shown. */
  readonly performance: boolean;
  readonly handlePerformance: () => void;
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
