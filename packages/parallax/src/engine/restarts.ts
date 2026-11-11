/* Who hears that the engine started again empty: with the reason, and whether it was planned, to give memory back,
 * rather than a trap. */

type RestartListener = (reason: string, planned: boolean) => void;

/** The listeners to an engine's restarts. */
class Restarts {
  readonly #listeners = new Set<RestartListener>();

  /** Adds `listener`, returning a function that removes it. */
  public add(listener: RestartListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  public tell(reason: string, planned: boolean): void {
    for (const listener of this.#listeners) {
      listener(reason, planned);
    }
  }
}

export { Restarts };
export type { RestartListener };
