/* Skeleton on the feedback and display page: a person's row and a table's rows while they load, in both shapes. */

import { Skeleton } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

const rows = ["first", "second", "third"] as const;

function SkeletonSection(): ReactElement {
  return (
    <Section
      title="Skeleton"
      description="Placeholders in the shape of what is loading. They pulse, and hold still under reduced motion."
    >
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="size-10" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="flex max-w-md flex-col gap-2">
        {rows.map((row) => (
          <div key={row} className="flex gap-4">
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </Section>
  );
}

export { SkeletonSection };
