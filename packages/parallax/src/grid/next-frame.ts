/* Work done once in the next animation frame, however often it is asked for before then: the grid's drawing, so that
 * every event, frame from the engine and change that arrives before a frame paints once. A hidden tab runs no
 * animation frames, so what is asked for while it is hidden runs in the first frame after it is shown. */

/** Runs `work` once in the next animation frame, however often asked for before it. */
class NextFrame {
  readonly #work: () => void;
  #request: number | null = null;

  public constructor(work: () => void) {
    this.#work = work;
  }

  /** Asks for the work in the next animation frame, unless it is already asked for. */
  public ask(): void {
    this.#request ??= requestAnimationFrame(() => {
      this.#request = null;
      this.#work();
    });
  }

  /** Drops the work asked for, as when the grid's elements go. */
  public cancel(): void {
    if (this.#request !== null) {
      cancelAnimationFrame(this.#request);
      this.#request = null;
    }
  }
}

export { NextFrame };
