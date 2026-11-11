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

/** Who hears the shared pointer move: where it is now, and where it was. */
type PointerListener = (now: SyncedPointer | null, was: SyncedPointer | null) => void;

/** Whether a move of the shared pointer concerns a chart of `group`: the pointer is over its group, or was. A chart in
 * no group, or another, draws nothing for it. */
function concerns(
  group: string | null,
  now: SyncedPointer | null,
  was: SyncedPointer | null,
): boolean {
  return group !== null && (now?.group === group || was?.group === group);
}

/** A listener that calls `act` only for a move that concerns the chart of `group`, which only such a move's crosshair
 * changes. */
function groupMoves(group: () => string | null, act: () => void): PointerListener {
  return (now, was) => {
    if (concerns(group(), now, was)) {
      act();
    }
  };
}

/** The pointer shared by the charts of the page, and who listens to it. */
class PointerSync {
  #pointer: SyncedPointer | null = null;
  readonly #listeners = new Set<PointerListener>();

  /** The pointer, or null when it is over no chart of a group. */
  public get pointer(): SyncedPointer | null {
    return this.#pointer;
  }

  /** Moves the shared pointer, or with null takes it away, and tells every listener. */
  public set(pointer: SyncedPointer | null): void {
    if (pointer === null && this.#pointer === null) {
      return;
    }
    const was = this.#pointer;
    this.#pointer = pointer;
    for (const listener of this.#listeners) {
      listener(pointer, was);
    }
  }

  /** Takes the pointer away if `source` holds it, as when the pointer leaves that chart or the chart goes. */
  public release(source: object): void {
    if (this.#pointer?.source === source) {
      this.set(null);
    }
  }

  /** Draws `chart` again whenever the pointer moves over the group of `model`, or off it, until the returned function
   * is called: a move elsewhere changes nothing it draws. */
  public follow(
    model: { readonly group: string | null },
    chart: { readonly schedule: () => void },
  ): () => void {
    return this.subscribe(
      groupMoves(
        () => model.group,
        () => {
          chart.schedule();
        },
      ),
    );
  }

  /** Calls `listener` whenever the pointer moves, until the returned function is called. */
  public subscribe(listener: PointerListener): () => void {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }
}

/** The page's shared pointer. */
const chartSync = new PointerSync();

export { PointerSync, chartSync, concerns, groupMoves };
export type { PointerListener, SyncedPointer };
