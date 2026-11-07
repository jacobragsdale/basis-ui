/* A list in the field list whose items are dragged: the fields, and each area's chips, which take drops too. What is
 * being dragged is the panel's typed state, not read back from the drag's data, so a drop from outside the panel, such
 * as text from another page, is ignored rather than parsed. The list takes its items' drag events as they bubble, and
 * Alt+Up and Alt+Down from inside an item, which move it a place for the keyboard; it takes those before the item's
 * buttons do, so that a menu's button does not open its menu, and the focus follows the item to its new place. */

import { useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode, RefObject } from "react";

import type { Placed } from "./edit.ts";

/** A field from the list, or a chip from an area. */
type Dragged =
  | { readonly kind: "field"; readonly column: string }
  | { readonly kind: "chip"; readonly chip: Placed };

/** Where a drop would land in a list that takes drops: before an item, by its index, or at the end, as the count. */
type Over = number | null;

/** A list that takes drops: whether something is being dragged that it would take, and what a drop does. */
interface Dropping {
  readonly accepting: boolean;
  /** Puts what is dragged before item `at`, or at the end for null. */
  readonly onDrop: (at: number | null) => void;
}

interface DragListProps {
  readonly label: string;
  /** Whether the order means something, as an area's does: an `<ol>` rather than a `<ul>`. */
  readonly ordered: boolean;
  readonly className: string;
  /** How many items it holds. */
  readonly count: number;
  /** What a drag of item `index` carries, or null when it carries nothing. */
  readonly dragOf: (index: number) => Dragged | null;
  /** Takes the start and the end of a drag that began here. */
  readonly onDrag: (dragged: Dragged | null) => void;
  /** How the list takes drops, or null for a list that takes none. */
  readonly dropping: Dropping | null;
  /** Moves item `index` a place up or down, for Alt+Up and Alt+Down. */
  readonly onStep?: (index: number, delta: -1 | 1) => void;
  /** The items, drawn knowing where a drop would land. Each is an `<li>` with `data-index`. */
  readonly children: (over: Over) => ReactNode;
}

/** The index of the item an event came from, or null. */
function indexOf(target: EventTarget): number | null {
  const item = target instanceof Element ? target.closest<HTMLElement>("[data-index]") : null;
  const index = Number(item?.dataset["index"] ?? Number.NaN);
  return Number.isInteger(index) ? index : null;
}

/** The item a drop at `y` would go before, among `list`'s items, or their count for the end. */
function dropIndex(list: Element, y: number): number {
  const items = [...list.querySelectorAll(":scope > [data-index]")];
  const at = items.findIndex((item) => {
    const box = item.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
  return at === -1 ? items.length : at;
}

/** Whether a drag left the element it was over, rather than moving onto one of its children. */
function leftTarget(event: DragEvent): boolean {
  const { currentTarget, relatedTarget } = event;
  return !(relatedTarget instanceof Node && currentTarget.contains(relatedTarget));
}

/** Starts a drag of an item, as a move that another application would receive as text. */
function startDrag(event: DragEvent, props: DragListProps): void {
  const index = indexOf(event.target);
  const dragged = index === null ? null : props.dragOf(index);
  if (dragged === null) {
    event.preventDefault();
    return;
  }
  const text = event.target instanceof HTMLElement ? event.target.textContent : "";
  event.dataTransfer.setData("text/plain", text.trim());
  event.dataTransfer.effectAllowed = "move";
  props.onDrag(dragged);
}

/** Where the focus goes once an item moved: the item's new place, and which of its buttons had it. */
interface Refocus {
  readonly index: number;
  readonly button: number;
}

/** Which of its item's buttons an element is, counted from the item's first, or -1. */
function buttonOf(target: EventTarget): number {
  const item = target instanceof Element ? target.closest("[data-index]") : null;
  const buttons = [...(item?.querySelectorAll("button") ?? [])];
  return target instanceof HTMLButtonElement ? buttons.indexOf(target) : -1;
}

/** Moves the focused item for Alt+Up and Alt+Down, and says where the focus goes once it has moved. */
function stepByKey(event: KeyboardEvent, props: DragListProps): Refocus | null {
  const delta = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  const index = indexOf(event.target);
  const { onStep, count } = props;
  if (!event.altKey || delta === undefined || index === null || onStep === undefined) {
    return null;
  }
  // Before the item's own buttons, so that a menu's button does not open its menu.
  event.preventDefault();
  event.stopPropagation();
  onStep(index, delta === 1 ? 1 : -1);
  return { button: buttonOf(event.target), index: Math.max(0, Math.min(index + delta, count - 1)) };
}

/** Puts the focus back on the moved item's button once the list shows it in its new place. */
function useRefocus(
  listRef: RefObject<HTMLElement | null>,
  refocusRef: RefObject<Refocus | null>,
): void {
  useEffect(() => {
    const target = refocusRef.current;
    refocusRef.current = null;
    if (target !== null && target.button !== -1) {
      const item = listRef.current?.querySelector(
        `:scope > [data-index="${String(target.index)}"]`,
      );
      item?.querySelectorAll("button")[target.button]?.focus();
    }
  });
}

/** A list of dragged items. */
function DragList(props: DragListProps): ReactNode {
  const { label, ordered, className, count, dropping, onDrag, children } = props;
  const [hovered, setHovered] = useState<Over>(null);
  const listRef = useRef<HTMLOListElement & HTMLUListElement>(null);
  const refocusRef = useRef<Refocus | null>(null);
  useRefocus(listRef, refocusRef);
  const over = dropping?.accepting === true ? hovered : null;
  const List = ordered ? "ol" : "ul";
  return (
    <List
      ref={listRef}
      aria-label={label}
      data-accepting={dropping?.accepting === true}
      data-drop-end={over === count}
      className={className}
      onDragStart={(event) => {
        startDrag(event, props);
      }}
      onDragEnd={() => {
        onDrag(null);
      }}
      onDragOver={(event) => {
        if (dropping?.accepting === true) {
          // Accepting the drag is what lets it drop here.
          event.preventDefault();
          setHovered(dropIndex(event.currentTarget, event.clientY));
        }
      }}
      onDragLeave={(event) => {
        if (leftTarget(event)) {
          setHovered(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const at = dropIndex(event.currentTarget, event.clientY);
        setHovered(null);
        if (dropping?.accepting === true) {
          dropping.onDrop(at >= count ? null : at);
        }
      }}
      onKeyDownCapture={(event) => {
        refocusRef.current = stepByKey(event, props) ?? refocusRef.current;
      }}
    >
      {children(over)}
    </List>
  );
}

export { DragList };
export type { Dragged, Over };
