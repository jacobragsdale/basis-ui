/* What a ResizableHandle does with the pointer and the keyboard, as the WAI-ARIA window splitter pattern asks: a
 * pointer drags it, the arrow keys along the group's direction move it by `keyboardStep` points, and Home and End move
 * it to the ends of its range. Each handler calls the app's own first, and stops if the app prevents the default. */

import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import type { GroupContextValue } from "./resizable-context.ts";
import { keyboardStep, panelsOf, resize, whole } from "./resizable-layout.ts";
import type { HandleRange, Pair, ResizableLayout } from "./resizable-layout.ts";

type Handler<Event> = ((event: Event) => void) | undefined;

/** The handlers an app may pass to the handle, which run before the handle's own. */
interface AppHandlers {
  readonly onKeyDown?: Handler<KeyboardEvent<HTMLDivElement>>;
  readonly onLostPointerCapture?: Handler<PointerEvent<HTMLDivElement>>;
  readonly onPointerDown?: Handler<PointerEvent<HTMLDivElement>>;
  readonly onPointerMove?: Handler<PointerEvent<HTMLDivElement>>;
  readonly onPointerUp?: Handler<PointerEvent<HTMLDivElement>>;
}

type KeyHandler = (event: KeyboardEvent<HTMLDivElement>) => void;
type PointerHandlers = Required<Omit<AppHandlers, "onKeyDown">>;

interface HandleBinding {
  readonly group: GroupContextValue;
  /** The panels the handle resizes and its range, or `null` when it is disabled or not between two panels. */
  readonly active: { readonly pair: Pair; readonly range: HandleRange } | null;
  readonly app: AppHandlers;
}

/** What a pointer drag started from. */
interface Drag {
  readonly pointer: number;
  readonly size: number;
  readonly layout: ResizableLayout;
  /** The panels' total length along the group, in pixels, which 100 percent stands for. */
  readonly extent: number;
  readonly latest: ResizableLayout;
}

/** The keys that move a handle, and where each moves its primary pane. */
function keyTargets(horizontal: boolean, range: HandleRange): Readonly<Record<string, number>> {
  return {
    End: range.max,
    Home: range.min,
    [horizontal ? "ArrowLeft" : "ArrowUp"]: range.now - keyboardStep,
    [horizontal ? "ArrowRight" : "ArrowDown"]: range.now + keyboardStep,
  };
}

/** The panels' total length along the group, in pixels. */
function extentOf(group: GroupContextValue): number {
  let extent = 0;
  for (const panel of panelsOf(group.entries)) {
    const box = panel.element.getBoundingClientRect();
    extent += group.orientation === "horizontal" ? box.width : box.height;
  }
  return extent;
}

function coordinateOf(group: GroupContextValue, event: PointerEvent): number {
  return group.orientation === "horizontal" ? event.clientX : event.clientY;
}

/** Where the handle's line is drawn while a `release` drag holds the panels still: moved along the group by the
 * primary pane's change in size since the drag started, in pixels, and marked `data-dragging`; or put back. */
function placeLine(element: HTMLElement, group: GroupContextValue, offset: number | null): void {
  if (offset === null) {
    element.style.removeProperty("translate");
    delete element.dataset["dragging"];
    return;
  }
  element.style.translate =
    group.orientation === "horizontal" ? `${String(offset)}px 0` : `0 ${String(offset)}px`;
  element.dataset["dragging"] = "";
}

/** What a drag that starts with `event` starts from. */
function dragFrom(group: GroupContextValue, range: HandleRange, event: PointerEvent): Drag {
  const { sizes } = group;
  return {
    extent: extentOf(group),
    latest: sizes,
    layout: sizes,
    pointer: coordinateOf(group, event),
    size: range.now,
  };
}

/** Follows the pointer from `start`: resizes the panels, or in a `release` group moves only the handle's line, and
 * returns the layout the drag has reached. */
function follow(
  event: PointerEvent<HTMLDivElement>,
  { group, pair }: { readonly group: GroupContextValue; readonly pair: Pair },
  start: Drag,
): ResizableLayout {
  const moved = ((coordinateOf(group, event) - start.pointer) / start.extent) * whole;
  const latest = resize(start.layout, pair, start.size + moved);
  if (group.resizeOn === "release") {
    const { id } = pair.before;
    const change = (latest[id] ?? 0) - (start.layout[id] ?? 0);
    placeLine(event.currentTarget, group, (change / whole) * start.extent);
  } else {
    group.dispatch({ layout: latest, type: "set" });
  }
  return latest;
}

/** The handle's pointer handlers: a drag moves the primary pane by the pointer's travel as a share of the panels'
 * length, from where the drag started, and reports the layout once the pointer lets go. In a `release` group the
 * panels keep their sizes until then, and only the handle's line moves. */
function usePointerDrag({ group, active, app }: HandleBinding): PointerHandlers {
  const drag = useRef<Drag | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    app.onPointerDown?.(event);
    if (active === null || event.defaultPrevented || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    drag.current = dragFrom(group, active.range, event);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    app.onPointerMove?.(event);
    const start = drag.current;
    if (start === null || active === null || start.extent === 0) {
      return;
    }
    drag.current = { ...start, latest: follow(event, { group, pair: active.pair }, start) };
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    (event.type === "pointerup" ? app.onPointerUp : app.onLostPointerCapture)?.(event);
    const start = drag.current;
    drag.current = null;
    if (start === null) {
      return;
    }
    if (group.resizeOn === "release") {
      placeLine(event.currentTarget, group, null);
      group.dispatch({ layout: start.latest, type: "set" });
    }
    group.onLayoutChanged?.(start.latest);
  };

  return {
    onLostPointerCapture: onPointerEnd,
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
  };
}

/** The handle's key handler: the arrow keys along the group move it a step, and Home and End to its range's ends. */
function keyDownHandler({ group, active, app }: HandleBinding): KeyHandler {
  return (event) => {
    app.onKeyDown?.(event);
    const target =
      active === null
        ? undefined
        : keyTargets(group.orientation === "horizontal", active.range)[event.key];
    if (active === null || target === undefined || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    const layout = resize(group.sizes, active.pair, target);
    group.dispatch({ layout, type: "set" });
    group.onLayoutChanged?.(layout);
  };
}

/** The handle's pointer and keyboard handlers. */
function useHandleInteraction(binding: HandleBinding): Required<AppHandlers> {
  return { ...usePointerDrag(binding), onKeyDown: keyDownHandler(binding) };
}

export { useHandleInteraction };
