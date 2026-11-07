/* The rows a pivot drilled into, and the pivot's changes as they reach the app: the rows add up to the value they
 * were found from only while the pivot's groups and filters stay as they were, so a change to those closes them. */

import { useState } from "react";

import type { DrillRequest } from "#grid/types.ts";
import type { Layout } from "#layout/layout.ts";

import { drillLayout, drillSource } from "./drill.ts";
import type { Drill } from "./drill-rows.tsx";

/** The rows open, and what changes them. */
interface Drilled {
  /** The rows open below the pivot, or null. */
  readonly drill: Drill | null;
  /** Hands a pivot's change on, closing the rows if it changes what they were found by. */
  readonly onChange: (layout: Layout) => void;
  /** Opens the rows behind a value. */
  readonly onDrill: (request: DrillRequest) => void;
  /** Replaces the rows' view, or closes them for null. */
  readonly setDrill: (drill: Drill | null) => void;
}

/** The rows behind a value of `current`, the pivot's layout, whose changes go to `change`. */
function useDrill(current: Layout | null, change: (layout: Layout) => void): Drilled {
  const [opened, setOpened] = useState<Drill | null>(null);
  // A layout from the app that changes the groups or filters hides them too.
  const drill = current !== null && opened?.source === drillSource(current) ? opened : null;
  return {
    drill,
    onChange: (next) => {
      if (opened !== null && drillSource(next) !== opened.source) {
        setOpened(null);
      }
      change(next);
    },
    onDrill: ({ label, path, split }) => {
      if (current !== null) {
        setOpened({
          label,
          layout: drillLayout(current, path, split),
          source: drillSource(current),
        });
      }
    },
    setDrill: setOpened,
  };
}

export { useDrill };
