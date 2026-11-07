/* One component's part of a gallery page: its name as a heading, a line on what it is for, and its examples. */

import type { ReactElement, ReactNode } from "react";

interface SectionProps {
  /** The component's name, which is also the section's heading and, in kebab case, its anchor. */
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

function Section({ title, description, children }: SectionProps): ReactElement {
  const id = title.toLowerCase().replaceAll(" ", "-");
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export { Section };
