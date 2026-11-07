/* The parts drawn over a chart's canvas that follow the pointer: the crosshair and its tooltip, the brushed band, and
 * a measurement's band and card. React renders them once; these write their places and the tooltip's rows straight
 * to the DOM, so a pointer moving at 60 frames a second renders nothing. */

import type { Rect } from "./model-types.ts";
import type { PlacedReading } from "./reading.ts";

/** The elements over the canvas that the overlay moves. */
interface OverlayElements {
  readonly crosshair: HTMLElement;
  readonly tip: HTMLElement;
  readonly band: HTMLElement;
  readonly measureBand: HTMLElement;
}

/** A tooltip row's classes: the series' key, its value, and its label. */
const rowClasses = "flex items-center gap-1.5 tabular-nums";
const keyClasses = "inline-block h-0.5 w-2.5 bg-(--key)";
const labelClasses = "text-muted-foreground";
const titleClasses = "mb-0.5 text-muted-foreground";

function pixels(value: number): string {
  return `${String(value)}px`;
}

/** Places `element` over `rect`, or hides it for null. */
function place(target: HTMLElement, rect: Rect | null): void {
  target.hidden = rect === null;
  if (rect !== null) {
    target.style.left = pixels(rect.x);
    target.style.top = pixels(rect.y);
    target.style.width = pixels(rect.width);
    target.style.height = pixels(rect.height);
  }
}

/** An element of `tag`, with `classes`, holding `text`. */
function element(
  document: Document,
  tag: string,
  { classes, text }: { readonly classes: string; readonly text: string },
): HTMLElement {
  const made = document.createElement(tag);
  made.className = classes;
  made.textContent = text;
  return made;
}

/** One row of a tooltip: the value leads, the label follows, the series' colour keys it. */
function tipRow(document: Document, row: PlacedReading["rows"][number]): HTMLElement {
  const line = element(document, "div", { classes: rowClasses, text: "" });
  line.dataset["slot"] = "chart-tip-row";
  const key = element(document, "span", { classes: keyClasses, text: "" });
  key.style.setProperty("--key", row.color ?? "transparent");
  const value = element(document, "strong", { classes: "", text: row.value });
  line.append(key, value, element(document, "span", { classes: labelClasses, text: row.label }));
  return line;
}

/** The moving parts over one chart's canvas. */
class ChartOverlay {
  readonly #elements: OverlayElements;
  /** What the tooltip shows now, so that its rows are written again only when they change. */
  #tipText = "";

  public constructor(elements: OverlayElements) {
    this.#elements = elements;
  }

  /** Shows a reading's crosshair and tooltip, or hides them for null. */
  public reading(reading: PlacedReading | null): void {
    const { crosshair, tip } = this.#elements;
    tip.hidden = reading === null;
    crosshair.hidden = reading?.crosshair === null || reading === null;
    if (reading === null) {
      return;
    }
    if (reading.crosshair !== null) {
      place(crosshair, { height: reading.height, width: 1, x: reading.crosshair, y: reading.top });
    }
    tip.style.left = pixels(reading.left);
    tip.style.top = pixels(reading.tipTop);
    this.#tipRows(reading);
  }

  /** Shows the brushed band, or hides it for null. */
  public band(rect: Rect | null): void {
    place(this.#elements.band, rect);
  }

  /** Shows a measurement's band, and places its card, or hides the band for null. */
  public measure(
    view: { readonly band: Rect; readonly card: { readonly x: number; readonly y: number } } | null,
    card: HTMLElement | null,
  ): void {
    place(this.#elements.measureBand, view?.band ?? null);
    if (view !== null && card !== null) {
      card.style.left = pixels(view.card.x);
      card.style.top = pixels(view.card.y);
    }
  }

  #tipRows(reading: PlacedReading): void {
    const text = JSON.stringify([reading.title, reading.rows]);
    if (text === this.#tipText) {
      return;
    }
    this.#tipText = text;
    const { tip } = this.#elements;
    const document = tip.ownerDocument;
    const title = element(document, "div", { classes: titleClasses, text: reading.title });
    title.dataset["slot"] = "chart-tip-title";
    tip.replaceChildren(title, ...reading.rows.map((row) => tipRow(document, row)));
  }
}

export { ChartOverlay };
export type { OverlayElements };
