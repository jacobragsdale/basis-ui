/* Progress on the feedback and display page: bars at a few values, each named by its label, with its value. */

import { Progress, ProgressLabel, ProgressValue } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

/** How far the example pricing run has got, in percent. */
const pricingRunDone = 40;

const examples = [
  ["Positions loaded", 0],
  ["Morning pricing run", pricingRunDone],
  ["Risk report", 100],
] as const;

function ProgressSection(): ReactElement {
  return (
    <Section
      title="Progress"
      description="How far a task has got: a bar named by its label, with its value in tabular figures."
    >
      <div className="flex max-w-md flex-col gap-4">
        {examples.map(([label, value]) => (
          <Progress key={label} value={value}>
            <ProgressLabel>{label}</ProgressLabel>
            <ProgressValue />
          </Progress>
        ))}
      </div>
    </Section>
  );
}

export { ProgressSection };
