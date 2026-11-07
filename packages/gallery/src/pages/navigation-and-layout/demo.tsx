/* One example within a section: a caption naming the variant or state it shows, above the example itself. */

import type { ReactElement, ReactNode } from "react";

interface DemoProps {
  /** The variant or state the example shows, such as "line". */
  readonly label: string;
  readonly children: ReactNode;
}

function Demo({ label, children }: DemoProps): ReactElement {
  return (
    <div className="flex min-w-48 flex-col gap-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export { Demo };
