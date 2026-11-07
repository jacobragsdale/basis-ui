/* Tabs on the navigation and layout page: the default and line lists, a disabled tab, icons, and a vertical set. */

import {
  ClockIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TrendingUpIcon,
  TriangleExclamationPointIcon,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { Demo } from "./demo.tsx";

interface DeskTabsProps {
  readonly variant?: "default" | "line";
  readonly orientation?: "horizontal" | "vertical";
}

/** The desk's three views, with an icon on each tab and the third disabled. */
function DeskTabs({
  variant = "default",
  orientation = "horizontal",
}: DeskTabsProps): ReactElement {
  return (
    <Tabs defaultValue="positions" orientation={orientation}>
      <TabsList variant={variant}>
        <TabsTrigger value="positions">
          <TrendingUpIcon data-icon="inline-start" />
          Positions
        </TabsTrigger>
        <TabsTrigger value="history">
          <ClockIcon data-icon="inline-start" />
          History
        </TabsTrigger>
        <TabsTrigger value="breaks" disabled>
          <TriangleExclamationPointIcon data-icon="inline-start" />
          Breaks
        </TabsTrigger>
      </TabsList>
      <TabsContent value="positions">Net long 42 million in the 10-year.</TabsContent>
      <TabsContent value="history">Twelve fills since the open.</TabsContent>
      <TabsContent value="breaks">No breaks to reconcile.</TabsContent>
    </Tabs>
  );
}

function TabsSection(): ReactElement {
  return (
    <Section
      title="Tabs"
      description="Panels shown one at a time. The arrow keys move between the tabs, and Enter or Space opens the one focused."
    >
      <div className="flex flex-wrap items-start gap-10">
        <Demo label="default">
          <DeskTabs />
        </Demo>
        <Demo label="line">
          <DeskTabs variant="line" />
        </Demo>
        <Demo label="vertical">
          <DeskTabs orientation="vertical" />
        </Demo>
      </div>
    </Section>
  );
}

export { DeskTabs, TabsSection };
