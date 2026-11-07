/* Resizable on the navigation and layout page: a trade list beside a trade's detail, which is split again into its
 * ticket above its fills, each panel held between its limits. */

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@basis/ui";
import type { ResizableLayout } from "@basis/ui";
import type { ReactElement, ReactNode } from "react";

import { Section } from "#pages/section.tsx";

import { Demo } from "./demo.tsx";

// The panels' sizes and limits, in percent of their group.
const listSize = 40;
const listMinimum = 20;
const listMaximum = 70;
const detailMinimum = 30;
const ticketSize = 60;
const ticketMinimum = 25;
const fillsMinimum = 20;

interface BlotterSplitProps {
  readonly defaultLayout?: ResizableLayout | undefined;
  readonly onLayoutChanged?: ((layout: ResizableLayout) => void) | undefined;
  readonly disabled?: boolean | undefined;
}

function Pane({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex h-full flex-col gap-1 p-3 text-sm">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

/** The trade list, 20 to 70 percent wide, beside the detail, which keeps at least 30 percent. */
function BlotterSplit({
  defaultLayout,
  onLayoutChanged,
  disabled,
}: BlotterSplitProps): ReactElement {
  return (
    <div className="h-72 overflow-hidden rounded-xl border">
      <ResizablePanelGroup defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
        <ResizablePanel
          id="trades"
          defaultSize={listSize}
          minSize={listMinimum}
          maxSize={listMaximum}
        >
          <Pane title="Trades">Today&apos;s fills, newest first.</Pane>
        </ResizablePanel>
        <ResizableHandle withHandle disabled={disabled} aria-label="Resize the trade list" />
        <ResizablePanel id="detail" minSize={detailMinimum}>
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel id="ticket" defaultSize={ticketSize} minSize={ticketMinimum}>
              <Pane title="Ticket">The selected trade&apos;s terms.</Pane>
            </ResizablePanel>
            <ResizableHandle aria-label="Resize the ticket" />
            <ResizablePanel id="fills" minSize={fillsMinimum}>
              <Pane title="Fills">The trade&apos;s executions.</Pane>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function ResizableSection(): ReactElement {
  return (
    <Section
      title="Resizable"
      description="Panels split by handles, for a master list beside its detail. Drag a handle, or focus it and use the arrow keys, Home and End; each panel keeps to its minimum and maximum."
    >
      <Demo label="horizontal with a grip, holding a vertical split">
        <BlotterSplit />
      </Demo>
    </Section>
  );
}

export { BlotterSplit, ResizableSection };
