/* The pointer's x shared between charts, so that the crosshairs and tooltips of a group move together. It lives
 * outside React: a chart publishes its pointer on every move, and the others repaint their crosshair from it without
 * a render. */

/** Where the pointer is, in axis positions, over a chart of a group. */
interface SyncedPointer {
  readonly group: string;
  readonly x: number;
  /** The chart the pointer is over, which draws its own reading. */
  readonly source: object;
}

/** The pointer shared by the charts of the page, and who listens to it. */
class PointerSync {
  #pointer: SyncedPointer | null = null;
  readonly #listeners = new Set<() => void>();

  /** The pointer, or null when it is over no chart of a group. */
  public get pointer(): SyncedPointer | null {
    return this.#pointer;
  }

  /** Moves the shared pointer, or with null takes it away, and tells every listener. */
  public set(pointer: SyncedPointer | null): void {
    if (pointer === null && this.#pointer === null) {
      return;
    }
    this.#pointer = pointer;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /** Takes the pointer away if `source` holds it, as when the pointer leaves that chart or the chart goes. */
  public release(source: object): void {
    if (this.#pointer?.source === source) {
      this.set(null);
    }
  }

  /** Calls `listener` whenever the pointer moves, until the returned function is called. */
  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }
}

/** The page's shared pointer. */
const chartSync = new PointerSync();

export { PointerSync, chartSync };
export type { SyncedPointer };
