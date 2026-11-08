/* SplitView: a list and the detail of what it selects, side by side and resizable, the divider where the user left it
 * on this page. Without a detail the list takes the whole width. */

import { useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./resizable.tsx";
import type { ResizableLayout } from "./resizable-layout.ts";

const prefix = "basis-ui-split:";
/** The list's and the detail's share of the width, in percent, until the user moves the divider. */
const half = 50;
const whole = 100;
const smallest = 20;

function readLayout(id: string): ResizableLayout | undefined {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(prefix + id) ?? "null");
    return typeof stored === "object" && stored !== null
      ? Object.fromEntries(Object.entries(stored).filter(([, size]) => typeof size === "number"))
      : undefined;
  } catch {
    return undefined;
  }
}

function writeLayout(id: string, layout: ResizableLayout): void {
  try {
    localStorage.setItem(prefix + id, JSON.stringify(layout));
  } catch {
    // Storage that is missing or full keeps nothing; the divider goes back to its default next time.
  }
}

interface SplitViewProps {
  /** Names the split, so its divider's place is kept for it. */
  readonly id: string;
  /** The list: the master side. */
  readonly children: ReactNode;
  /** What the list selects, beside it; the list takes the whole width while it is `null`. */
  readonly detail: ReactNode;
}

/** A list and its selection's detail, side by side, with a divider the user drags and that stays where they leave it.
 *
 * @example
 * ```tsx
 * import { SplitView } from "@basis/ui";
 *
 * <SplitView id="positions" detail={<p>Position details</p>}>
 *   <p>Positions</p>
 * </SplitView>;
 * ```
 */
function SplitView({ id, children, detail }: SplitViewProps): ReactElement {
  const [layout, setLayout] = useState(() => readLayout(id));
  const shown = detail !== null && detail !== undefined;
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={layout}
      onLayoutChanged={(next) => {
        writeLayout(id, next);
        setLayout(next);
      }}
    >
      <ResizablePanel id={`${id}-list`} defaultSize={shown ? half : whole} minSize={smallest}>
        {children}
      </ResizablePanel>
      {shown ? <ResizableHandle /> : null}
      {shown ? (
        <ResizablePanel id={`${id}-detail`} defaultSize={half} minSize={smallest}>
          {detail}
        </ResizablePanel>
      ) : null}
    </ResizablePanelGroup>
  );
}

export { SplitView };
