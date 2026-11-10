/* The context a ResizablePanelGroup gives its panels and handles, and the hook each uses to join its group while
 * it is mounted. It lives apart from resizable.tsx because a component file exports only components. */

import { createContext, use, useLayoutEffect } from "react";
import type { Dispatch } from "react";

import type {
  Entry,
  GroupAction,
  Orientation,
  ResizableLayout,
  ResizeOn,
} from "./resizable-layout.ts";

interface GroupContextValue {
  readonly orientation: Orientation;
  readonly disabled: boolean;
  /** When a pointer drag resizes the panels: as it moves, or once, when it lets go. */
  readonly resizeOn: ResizeOn;
  /** The group's panels and handles in their DOM order. */
  readonly entries: readonly Entry[];
  /** Every panel's size, resolved from the layout, the defaults and the limits. */
  readonly sizes: ResizableLayout;
  readonly dispatch: Dispatch<GroupAction>;
  readonly onLayoutChanged: ((layout: ResizableLayout) => void) | undefined;
}

const GroupContext = createContext<GroupContextValue | null>(null);

/** The group around a panel or handle, named `part` in the error when there is none. */
function useGroup(part: string): GroupContextValue {
  const group = use(GroupContext);
  if (group === null) {
    throw new Error(`${part} must be inside a ResizablePanelGroup.`);
  }
  return group;
}

/** Keeps `entry` in its group from mount to unmount, and again whenever it changes. A panel that leaves keeps its
 * size in the layout, so changing its limits never resets it. */
function useEntry(dispatch: Dispatch<GroupAction>, entry: Entry | null): void {
  useLayoutEffect((): (() => void) => {
    if (entry !== null) {
      dispatch({ entry, type: "add" });
    }
    return () => {
      if (entry !== null) {
        dispatch({ id: entry.id, type: "remove" });
      }
    };
  }, [dispatch, entry]);
}

export { GroupContext, useEntry, useGroup };
export type { GroupContextValue };
