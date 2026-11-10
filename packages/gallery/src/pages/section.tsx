/* One component's part of a gallery page: its name as a heading, a line on what it is for, and its examples. Its
 * `data-shot` hook names it to the screenshots and the axe check; when the page shows one section alone (shot.ts),
 * every other section renders nothing. */

import { useContext } from "react";
import type { ReactElement, ReactNode } from "react";

import { ShownSection, sectionId } from "./shot.ts";

interface SectionProps {
  /** The component's name, which is also the section's heading and, in kebab case, its anchor and `data-shot` id. */
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

function Section({ title, description, children }: SectionProps): ReactElement | null {
  const shown = useContext(ShownSection);
  const id = sectionId(title);
  if (shown !== null && shown !== id) {
    return null;
  }
  return (
    <section aria-labelledby={id} data-shot={id} className="flex flex-col gap-4">
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
