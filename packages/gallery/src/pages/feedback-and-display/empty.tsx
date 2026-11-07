/* Empty on the feedback and display page: each variant, one with an icon on a tile and an action, one with a plain
 * icon. */

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  FunnelIcon,
  SearchIcon,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

function EmptySection(): ReactElement {
  return (
    <Section
      title="Empty"
      description="What a view shows when it has nothing to show, and what to do about it. outline draws a dashed border."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FunnelIcon />
            </EmptyMedia>
            <EmptyTitle>No trades match these filters</EmptyTitle>
            <EmptyDescription>Widen the date range or clear a filter to see more.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm">
              Clear filters
            </Button>
          </EmptyContent>
        </Empty>
        <Empty variant="outline">
          <EmptyHeader>
            <EmptyMedia>
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No saved views</EmptyTitle>
            <EmptyDescription>
              Save a view of this blotter to come back to it later.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Section>
  );
}

export { EmptySection };
