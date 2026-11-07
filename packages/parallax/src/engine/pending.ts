/* The requests of one kind that wait for their answers, each answered once by its request id. */

/** A request's settlement. */
interface Settle<TValue> {
  readonly resolve: (value: TValue) => void;
  readonly reject: (error: Error) => void;
}

/** The requests of one kind waiting for their answers. */
class Requests<TValue> {
  readonly #pending = new Map<bigint, Settle<TValue>>();

  /** Sends a request and waits for its answer. */
  public async ask(send: () => bigint): Promise<TValue> {
    const { promise, resolve, reject } = Promise.withResolvers<TValue>();
    this.#pending.set(send(), { reject, resolve });
    return promise;
  }

  public has(requestId: bigint): boolean {
    return this.#pending.has(requestId);
  }

  /** Answers request `requestId`, if it waits. */
  public resolve(requestId: bigint, value: TValue): void {
    this.#take(requestId)?.resolve(value);
  }

  /** Fails request `requestId`, if it waits, and says whether it did. */
  public reject(requestId: bigint, error: Error): boolean {
    const pending = this.#take(requestId);
    pending?.reject(error);
    return pending !== undefined;
  }

  /** Fails every request still waiting. */
  public failAll(reason: string): void {
    const waiting = [...this.#pending.values()];
    this.#pending.clear();
    for (const pending of waiting) {
      pending.reject(new Error(reason));
    }
  }

  #take(requestId: bigint): Settle<TValue> | undefined {
    const pending = this.#pending.get(requestId);
    this.#pending.delete(requestId);
    return pending;
  }
}

export { Requests };
