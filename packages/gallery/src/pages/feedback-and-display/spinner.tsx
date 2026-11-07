/* Spinner on the feedback and display page: the default, a larger one named for what it loads, one beside text, and
 * one in a busy Button, hidden from assistive technology there since the Button's text already says it is busy. */

import { Button, Spinner } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

function SpinnerSection(): ReactElement {
  return (
    <Section
      title="Spinner"
      description="A turning loader, announced as a status. It holds still under reduced motion."
    >
      <div className="flex flex-wrap items-center gap-6">
        <Spinner />
        <Spinner className="size-6" aria-label="Loading positions" />
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-label="Loading prices" />
          Loading prices
        </span>
        <Button disabled>
          <Spinner data-icon="inline-start" aria-hidden />
          Saving
        </Button>
      </div>
    </Section>
  );
}

export { SpinnerSection };
