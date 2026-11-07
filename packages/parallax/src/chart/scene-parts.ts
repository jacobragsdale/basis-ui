/* The elements a scene draws in, which React hands it through callback refs, one per part: once every part it needs is
 * on the page the scene draws in them, and when one goes or changes, it starts again with the parts there are. */

import type { SceneElements } from "./scene.ts";

/** A part of a chart's markup the scene draws in or reads. */
type PartName =
  | "root"
  | "plot"
  | "canvas"
  | "crosshair"
  | "tip"
  | "band"
  | "measureBand"
  | "words"
  | "summary"
  | "asOf";

/** The elements a scene attaches to: its own, and the chart's root, whose size decides its layout. */
interface AttachedElements extends SceneElements {
  readonly root: HTMLElement;
}

/** Each part's callback ref, and the scene attached to the parts that are there. */
class SceneParts {
  /** Each part's callback ref, which mounts it in the scene: the same function for the scene's life. */
  public readonly mount: Readonly<Record<PartName, (element: HTMLElement | null) => void>>;
  readonly #elements = new Map<PartName, HTMLElement>();
  readonly #attach: (elements: AttachedElements) => () => void;
  #detach: (() => void) | null = null;

  public constructor(attach: (elements: AttachedElements) => () => void) {
    this.#attach = attach;
    this.mount = {
      asOf: this.#refOf("asOf"),
      band: this.#refOf("band"),
      canvas: this.#refOf("canvas"),
      crosshair: this.#refOf("crosshair"),
      measureBand: this.#refOf("measureBand"),
      plot: this.#refOf("plot"),
      root: this.#refOf("root"),
      summary: this.#refOf("summary"),
      tip: this.#refOf("tip"),
      words: this.#refOf("words"),
    };
  }

  /** The element of a part, if it is on the page. */
  public get(name: PartName): HTMLElement | null {
    return this.#elements.get(name) ?? null;
  }

  #refOf(name: PartName): (element: HTMLElement | null) => void {
    return (element) => {
      if (element === this.#elements.get(name)) {
        return;
      }
      if (element === null) {
        this.#elements.delete(name);
      } else {
        this.#elements.set(name, element);
      }
      this.#reattach();
    };
  }

  /** Detaches from the parts that were there, and attaches to those there now, if every one it needs is. */
  #reattach(): void {
    this.#detach?.();
    this.#detach = null;
    const elements = this.#complete();
    if (elements !== null) {
      this.#detach = this.#attach(elements);
    }
  }

  #complete(): AttachedElements | null {
    const [root, plot, canvas, crosshair, tip] = [
      this.get("root"),
      this.get("plot"),
      this.get("canvas"),
      this.get("crosshair"),
      this.get("tip"),
    ];
    const [band, measureBand, words] = [
      this.get("band"),
      this.get("measureBand"),
      this.get("words"),
    ];
    if (
      root === null ||
      plot === null ||
      !(canvas instanceof HTMLCanvasElement) ||
      crosshair === null
    ) {
      return null;
    }
    if (tip === null || band === null || measureBand === null || words === null) {
      return null;
    }
    const [asOf, summary] = [this.get("asOf"), this.get("summary")];
    return { asOf, band, canvas, crosshair, measureBand, plot, root, summary, tip, words };
  }
}

export { SceneParts };
export type { AttachedElements, PartName };
