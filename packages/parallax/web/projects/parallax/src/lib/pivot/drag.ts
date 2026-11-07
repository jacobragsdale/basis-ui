/**
 * Dragging in the field list. What is being dragged is kept in the panel as typed state, not read back from the drag's
 * data, so a drop from outside the panel, such as text from another page, is ignored rather than parsed.
 */

import type { Placed } from "./edit";

/** A field from the list, or a chip from an area. */
export type Dragged = { readonly kind: "field"; readonly column: string } | { readonly kind: "chip"; readonly chip: Placed };

/** Starts a drag of `text`, which another application would receive, as a move. */
export function beginDrag(event: DragEvent, text: string): void {
  const transfer = event.dataTransfer;
  if (transfer !== null) {
    transfer.setData("text/plain", text);
    transfer.effectAllowed = "move";
  }
}

/** The chip a drop at `y` would go before, among `list`'s chips, or their count for the end. */
export function dropIndex(list: Element, y: number): number {
  const chips = [...list.querySelectorAll(":scope > .px-chip")];
  const at = chips.findIndex((chip) => {
    const box = chip.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
  return at === -1 ? chips.length : at;
}

/** Whether a drag left the element it was over, rather than moving onto one of its children. */
export function leftTarget(event: DragEvent): boolean {
  const target = event.currentTarget;
  const to = event.relatedTarget;
  return !(target instanceof Element && to instanceof Node && target.contains(to));
}
