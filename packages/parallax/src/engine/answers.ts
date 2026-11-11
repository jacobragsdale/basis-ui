/* The page's loads and exports waiting for the worker's answers, each matched by its id. */

import type { Reply } from "./replies.ts";

/** An answer to one request. */
type Answer = Extract<Reply, { readonly kind: "loaded" | "exported" | "unloaded" }>;

/** An answer, with the chunks of a CSV collected for it. */
type Answered = Answer & { readonly parts: Blob | null };

interface Waiting {
  readonly resolve: (answer: Answered) => void;
  readonly reject: (error: Error) => void;
  /** A CSV export's chunks so far, joined without copying. */
  parts: Blob | null;
}

/** The requests waiting on one engine. */
class Answers {
  readonly #waiting = new Map<number, Waiting>();
  #nextId = 1;

  /** Starts a request with a fresh id, which `send` posts, and waits for its answer. */
  public async ask(send: (id: number) => void): Promise<Answered> {
    const id = this.#nextId;
    this.#nextId += 1;
    const { promise, resolve, reject } = Promise.withResolvers<Answered>();
    this.#waiting.set(id, { parts: null, reject, resolve });
    send(id);
    return promise;
  }

  /** Answers request `id`, with any chunks collected for it, or fails it. */
  public settle(id: number, outcome: Answer | Error): void {
    const waiting = this.#waiting.get(id);
    this.#waiting.delete(id);
    if (outcome instanceof Error) {
      waiting?.reject(outcome);
    } else {
      waiting?.resolve({ ...outcome, parts: waiting.parts });
    }
  }

  /** Adds a CSV chunk to its export's file, as a Blob made of a Blob, which refers to its parts rather than copying
   * them, so the chunk can be freed. */
  public chunk(id: number, bytes: Uint8Array<ArrayBuffer>): void {
    const waiting = this.#waiting.get(id);
    if (waiting !== undefined) {
      waiting.parts = new Blob(waiting.parts === null ? [bytes] : [waiting.parts, bytes]);
    }
  }

  /** Whether no request is waiting for its answer. */
  public get idle(): boolean {
    return this.#waiting.size === 0;
  }

  /** Fails every request still waiting. */
  public failAll(reason: string): void {
    for (const id of this.#waiting.keys()) {
      this.settle(id, new Error(reason));
    }
  }
}

export { Answers };
export type { Answered };
