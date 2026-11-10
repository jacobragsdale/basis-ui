/* The engine's real worker behind a gate the test opens and closes: while it is closed, the worker's messages wait,
 * so a test can act before the engine's answers arrive, and then let them in. Every request the page posts is kept,
 * decoded, so a test can count what was asked. */

import { fromBinary } from "@bufbuild/protobuf";

import type { ToWorker } from "#engine/messages.ts";
import type { WorkerPort } from "#engine/port.ts";
import { ClientMessageSchema } from "#proto/parallax_pb.ts";
import type { ClientMessage } from "#proto/parallax_pb.ts";

import { startWorker } from "./data.ts";

/** A worker whose messages to the page wait while its gate is closed. */
interface GatedWorker {
  /** Starts the worker, as ParallaxProvider's `worker`; once only. */
  readonly start: () => WorkerPort;
  /** Holds the worker's messages until `open`. */
  readonly close: () => void;
  /** Lets in every message held, in order, and those after them. */
  readonly open: () => void;
  /** Lets in every message held, in order, and holds those after them. */
  readonly deliver: () => void;
  /** The protocol requests the page posted so far, of one kind. */
  readonly sent: (kind: NonNullable<ClientMessage["body"]["case"]>) => ClientMessage[];
}

function gatedWorker(): GatedWorker {
  const posted: ClientMessage[] = [];
  const held: (() => void)[] = [];
  let gated = false;
  const deliver = (): void => {
    for (const message of held.splice(0)) {
      message();
    }
  };
  return {
    close: (): void => {
      gated = true;
    },
    deliver,
    open: (): void => {
      gated = false;
      deliver();
    },
    sent: (kind) => posted.filter((message) => message.body.case === kind),
    start: (): WorkerPort => {
      const worker = startWorker();
      return {
        addEventListener: (type, listener): void => {
          worker.addEventListener(type, (event) => {
            if (type === "message" && gated) {
              held.push(() => {
                listener(event);
              });
            } else {
              listener(event);
            }
          });
        },
        postMessage: (message: ToWorker, options): void => {
          if (message.kind === "message") {
            posted.push(fromBinary(ClientMessageSchema, message.bytes));
          }
          worker.postMessage(message, options);
        },
        terminate: (): void => {
          worker.terminate();
        },
      };
    },
  };
}

export { gatedWorker };
export type { GatedWorker };
