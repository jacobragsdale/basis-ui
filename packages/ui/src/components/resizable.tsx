/* Resizable: panels side by side or stacked, split by handles that resize the two panels beside them. shadcn wraps
 * react-resizable-panels; @basis/ui builds it on the WAI-ARIA window splitter pattern instead, so the package adds no
 * dependency. It keeps shadcn's names (ResizablePanelGroup, ResizablePanel, and ResizableHandle with `withHandle`) and
 * react-resizable-panels' prop names where it has the same feature.
 *
 * Sizes are percentages of the group, as numbers from 0 to 100; react-resizable-panels 4 would read a bare number as
 * pixels. A panel's size is the layout the user has set, else its `defaultSize`, else an equal share of what the
 * others leave, held between its `minSize` and `maxSize` with the sizes summing to 100 (resizable-layout.ts). Each
 * panel grows by its percentage from a zero basis, so the handles' own width never pushes the sum past the group.
 *
 * A handle is a focusable `separator` whose value is the size of the panel before it, the primary pane, and whose
 * range is what both panels' limits allow that pane (resizable-handle.ts has its keys). For a finger, its 24 px hit
 * area reaches past the drawn line on both sides, over the panels' edges, as react-resizable-panels' own hit targets
 * do. For a mouse it is 4 px, 3 in the compact density, so a panel's scrollbar beside the line stays the panel's: the
 * arrow keys on the focused handle are its equivalent, WCAG 2.2's exception to the 24 px target, as SidebarRail's is. */

import { mergeProps } from "@base-ui/react/merge-props";
import { cn } from "cn";
import { useId, useMemo, useReducer, useState } from "react";
import type { ComponentProps, ReactElement } from "react";

import { GroupContext, useEntry, useGroup } from "./resizable-context.ts";
import type { GroupContextValue } from "./resizable-context.ts";
import { useHandleInteraction } from "./resizable-handle.ts";
import {
  pairOf,
  panelsOf,
  rangeOf,
  reduceGroup,
  resolveLayout,
  whole,
} from "./resizable-layout.ts";
import type { Orientation, PanelEntry, ResizableLayout } from "./resizable-layout.ts";

interface ResizablePanelGroupProps extends Omit<ComponentProps<"div">, "ref"> {
  /** `horizontal` puts the panels side by side, `vertical` stacks them. */
  readonly orientation?: Orientation | undefined;
  /** The sizes to start from, by panel `id`, such as a layout `onLayoutChanged` stored. Read once, on mount. */
  readonly defaultLayout?: ResizableLayout | undefined;
  /** Called with the new layout when a drag ends or a key moves a handle: the time to store it. */
  readonly onLayoutChanged?: ((layout: ResizableLayout) => void) | undefined;
  /** Stops every handle in the group from resizing. */
  readonly disabled?: boolean | undefined;
}

/** A group of panels split by handles, filling its parent. Give each panel an `id` when its layout is stored.
 *
 * @example
 * ```tsx
 * import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@basis/ui";
 *
 * <ResizablePanelGroup orientation="horizontal">
 *   <ResizablePanel>Positions</ResizablePanel>
 *   <ResizableHandle />
 *   <ResizablePanel>Position details</ResizablePanel>
 * </ResizablePanelGroup>;
 * ```
 */
function ResizablePanelGroup({
  orientation = "horizontal",
  defaultLayout,
  onLayoutChanged,
  disabled = false,
  className,
  ...props
}: ResizablePanelGroupProps): ReactElement {
  const [state, dispatch] = useReducer(reduceGroup, defaultLayout, (layout) => ({
    entries: [],
    layout: layout ?? {},
  }));
  const group = useMemo<GroupContextValue>(
    () => ({
      disabled,
      dispatch,
      entries: state.entries,
      onLayoutChanged,
      orientation,
      sizes: resolveLayout(panelsOf(state.entries), state.layout),
    }),
    [disabled, onLayoutChanged, orientation, state],
  );
  return (
    <GroupContext value={group}>
      <div
        data-slot="resizable-panel-group"
        data-orientation={orientation}
        className={cn("flex size-full data-[orientation=vertical]:flex-col", className)}
        {...props}
      />
    </GroupContext>
  );
}

interface ResizablePanelProps extends Omit<ComponentProps<"div">, "ref"> {
  /** Names the panel in a stored layout and in its handle's `aria-controls`; generated when left out. */
  readonly id?: string | undefined;
  /** Its starting size, in percent; without one it shares what the other panels leave. */
  readonly defaultSize?: number | undefined;
  /** The smallest it may be, in percent; 0 by default. */
  readonly minSize?: number | undefined;
  /** The largest it may be, in percent; 100 by default. */
  readonly maxSize?: number | undefined;
}

/** A panel of a ResizablePanelGroup, which must be one of the group's own children. */
function ResizablePanel({
  id: givenId,
  defaultSize,
  minSize = 0,
  maxSize = whole,
  className,
  ...props
}: ResizablePanelProps): ReactElement {
  const { dispatch, sizes } = useGroup("ResizablePanel");
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const entry = useMemo<PanelEntry | null>(
    () => (element === null ? null : { defaultSize, element, id, kind: "panel", maxSize, minSize }),
    [defaultSize, element, id, maxSize, minSize],
  );
  useEntry(dispatch, entry);
  const own = {
    className: cn(
      "min-h-0 min-w-0 shrink grow-(--resizable-panel-size) basis-0 overflow-hidden",
      className,
    ),
    style: { "--resizable-panel-size": sizes[id] ?? defaultSize ?? 1 },
  };
  return (
    <div ref={setElement} id={id} data-slot="resizable-panel" {...mergeProps<"div">(own, props)} />
  );
}

interface ResizableHandleProps extends Omit<ComponentProps<"div">, "ref"> {
  /** Draws a grip on the line. */
  readonly withHandle?: boolean | undefined;
  /** Stops this handle from resizing its panels. */
  readonly disabled?: boolean | undefined;
}

/** The handle between two panels: a focusable separator, which an app names with `aria-label`, such as "Resize the
 * trade list". Drag it, or focus it and use the arrow keys, Home and End. */
function ResizableHandle({
  withHandle = false,
  disabled = false,
  className,
  ...props
}: ResizableHandleProps): ReactElement {
  const group = useGroup("ResizableHandle");
  const id = useId();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useEntry(
    group.dispatch,
    useMemo(() => (element === null ? null : { element, id, kind: "handle" }), [element, id]),
  );
  const pair = disabled || group.disabled ? null : pairOf(group.entries, id);
  const active = pair === null ? null : { pair, range: rangeOf(pair, group.sizes) };
  const handlers = useHandleInteraction({ active, app: props, group });
  return (
    <div
      ref={setElement}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a window splitter takes focus and holds its grip; <hr> is a void element.
      role="separator"
      tabIndex={active === null ? undefined : 0}
      aria-orientation={group.orientation === "horizontal" ? "vertical" : "horizontal"}
      aria-controls={active?.pair.before.id}
      aria-valuenow={active === null ? undefined : Math.round(active.range.now)}
      aria-valuemin={active === null ? undefined : Math.round(active.range.min)}
      aria-valuemax={active === null ? undefined : Math.round(active.range.max)}
      aria-disabled={active === null ? true : undefined}
      data-slot="resizable-handle"
      className={cn(
        "relative z-10 flex shrink-0 touch-none items-center justify-center bg-border outline-none select-none after:absolute focus-visible:ring-1 focus-visible:ring-ring aria-disabled:cursor-default",
        "aria-[orientation=vertical]:w-px aria-[orientation=vertical]:cursor-col-resize aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:left-1/2 aria-[orientation=vertical]:after:w-target aria-[orientation=vertical]:after:-translate-x-1/2 pointer-fine:aria-[orientation=vertical]:after:w-1",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:h-target aria-[orientation=horizontal]:after:-translate-y-1/2 pointer-fine:aria-[orientation=horizontal]:after:h-1 [&[aria-orientation=horizontal]>div]:rotate-90",
        className,
      )}
      {...props}
      {...handlers}
    >
      {withHandle ? <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border" /> : null}
    </div>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
