/* Workers that record what the page posts and let a test answer, for the engine's and the client's tests. */

import { create, toBinary } from "@bufbuild/protobuf";

import { BrowserEngine } from "#engine/browser-engine.ts";
import type { ToWorker } from "#engine/messages.ts";
import type { WorkerPort } from "#engine/port.ts";
import { ServerMessageSchema } from "#proto/parallax_pb.ts";

/** A worker that records what the page posts and lets the test answer. */
class FakeWorker implements WorkerPort {
  public readonly posted: ToWorker[] = [];
  /** What each message's transfer list moved, by the message's place in `posted`. */
  public readonly transferred: (readonly Transferable[])[] = [];
  public terminated = false;
  readonly #listeners = new Map<string, (event: Event) => void>();

  public readonly postMessage = (message: ToWorker, options: StructuredSerializeOptions): void => {
    this.posted.push(message);
    this.transferred.push(options.transfer ?? []);
  };

  public readonly addEventListener = (type: string, listener: (event: Event) => void): void => {
    this.#listeners.set(type, listener);
  };

  public readonly terminate = (): void => {
    this.terminated = true;
  };

  /** Sends the page a message, as the worker would. */
  public answer(data: unknown): void {
    this.#listeners.get("message")?.(new MessageEvent("message", { data }));
  }

  /** Fires the event a worker fires when its script fails to load or run. */
  public crash(message: string): void {
    this.#listeners.get("error")?.(new ErrorEvent("error", { message }));
  }

  /** The messages of one kind posted so far. */
  public sent<TKind extends ToWorker["kind"]>(
    kind: TKind,
  ): Extract<ToWorker, { readonly kind: TKind }>[] {
    return this.posted.filter(
      (message): message is Extract<ToWorker, { readonly kind: TKind }> => message.kind === kind,
    );
  }
}

/** Fake workers started so far, so that a test can reach the one that replaced a trapped worker. */
interface FakeWorkers {
  readonly all: readonly FakeWorker[];
  readonly start: () => FakeWorker;
  readonly current: () => FakeWorker;
}

/** Starts fake workers, keeping each. */
function fakeWorkers(): FakeWorkers {
  const all: FakeWorker[] = [];
  return {
    all,
    current: () => {
      const worker = all.at(-1);
      if (worker === undefined) {
        throw new Error("No worker has started.");
      }
      return worker;
    },
    start: () => {
      const worker = new FakeWorker();
      all.push(worker);
      return worker;
    },
  };
}

/** An engine on fake workers, and its first worker. */
function engineWithWorker(): {
  readonly engine: BrowserEngine;
  readonly worker: FakeWorker;
  readonly workers: FakeWorkers;
} {
  const workers = fakeWorkers();
  const engine = new BrowserEngine(workers.start);
  return { engine, worker: workers.current(), workers };
}

/** Text's UTF-8 bytes, in the page's own Uint8Array, as the worker's messages arrive. */
function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(new TextEncoder().encode(text));
}

/** The engine's refusal of a request of view `viewId`, encoded as the worker sends it. */
function refusal(viewId: number, message: string): Uint8Array {
  return toBinary(
    ServerMessageSchema,
    create(ServerMessageSchema, {
      body: { case: "error", value: { message, viewId } },
      requestId: 2n,
    }),
  );
}

/** Opens a view and returns the errors it reports. */
function openView(engine: BrowserEngine, dataset: string): string[] {
  const errors: string[] = [];
  engine.connection.open(dataset, "{}", {
    error: (message) => {
      errors.push(message);
    },
    frame: (): void => {
      errors.push("a frame nobody expected");
    },
  });
  return errors;
}

export { FakeWorker, bytesOf, engineWithWorker, fakeWorkers, openView, refusal };
export type { FakeWorkers };
