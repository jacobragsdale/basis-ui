/* A response's body on its way to the worker. The page checks the response before its body is read, then posts each
 * chunk to the worker as the network delivers it, the chunk's own buffer moved rather than copied, so that the engine
 * reads each record batch as soon as it is all there. The page pushes rather than the worker pulling: a stream moved to
 * the worker waits for the worker to ask for each chunk, and on a slow desktop that round trip costs more than the
 * download. */

import { streamedTooManyBytes, tooManyBytes } from "./limits.ts";
import type { ToWorker } from "./messages.ts";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A response's length, when it says it and its body arrives as it was sent: a compressed body's `Content-Length`
 * counts the bytes before they are decompressed. */
function contentLength(response: Response): number | null {
  const encoding = response.headers.get("content-encoding");
  const length = Number(response.headers.get("content-length") ?? Number.NaN);
  const plain = encoding === null || encoding === "identity";
  return plain && Number.isSafeInteger(length) && length >= 0 ? length : null;
}

/** Checks a response before its body is read: it must have succeeded, and must not say it is past the byte limit.
 * Returns its length, if it says it; a refused response's body is cancelled. */
async function checkResponse(
  dataset: string,
  response: Response,
  mostBytes: number,
): Promise<number | null> {
  const length = contentLength(response);
  let refusal: Error | null = null;
  if (!response.ok) {
    const from = response.url === "" ? "its request" : response.url;
    refusal = new Error(
      `${dataset} did not arrive: ${from} answered ${String(response.status)}; check that its API serves it.`,
    );
  } else if (length !== null && length > mostBytes) {
    refusal = tooManyBytes(dataset, length, mostBytes);
  }
  if (refusal !== null) {
    await response.body?.cancel();
    throw refusal;
  }
  return length;
}

/** Where a body goes: the load's id and the worker's answer to it, the dataset and the byte limit, and how to post to
 * the worker. */
interface Pipe {
  readonly id: number;
  readonly answer: Promise<unknown>;
  readonly dataset: string;
  readonly mostBytes: number;
  /** Posts a message to the worker, moving the buffers in `transfer`. */
  readonly post: (message: ToWorker, transfer: Transferable[]) => void;
}

/** A chunk's bytes as a buffer of their own, to move: the chunk's own buffer when it holds nothing else, as the
 * network's chunks do, or else a copy. */
function ownBuffer(chunk: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = chunk;
  const whole =
    buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength;
  return whole ? buffer : new Uint8Array(chunk).buffer;
}

/** Posts a body's chunks as they arrive, until it ends or the worker has answered, refusing it once it passes the
 * byte limit. */
async function postChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pipe: Pipe,
  answered: () => boolean,
): Promise<void> {
  let total = 0;
  // oxlint-disable-next-line eslint/no-await-in-loop -- a body is read a chunk at a time, as it arrives.
  for (let read = await reader.read(); !read.done && !answered(); read = await reader.read()) {
    total += read.value.byteLength;
    if (total > pipe.mostBytes) {
      throw streamedTooManyBytes(pipe.dataset, pipe.mostBytes);
    }
    const bytes = ownBuffer(read.value);
    pipe.post({ bytes, id: pipe.id, kind: "load-bytes" }, [bytes]);
  }
}

/** Posts a body's chunks, and returns why it failed on its way, if it did; a body that fails is cancelled. */
async function postAll(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pipe: Pipe,
  answered: () => boolean,
): Promise<string | null> {
  try {
    await postChunks(reader, pipe, answered);
    return null;
  } catch (error: unknown) {
    reader.cancel().catch(() => null);
    return describe(error);
  }
}

/** Posts a load's body to the worker chunk by chunk as it arrives, then says that it ended, or why it failed on its
 * way. Once the worker has answered, as when it refused the rows so far, the body is cancelled and the rest is not
 * read. */
async function streamBody(body: ReadableStream<Uint8Array>, pipe: Pipe): Promise<void> {
  const reader = body.getReader();
  let answered = false;
  const over = (): null => {
    answered = true;
    reader.cancel().catch(() => null);
    return null;
  };
  const watching = pipe.answer.then(over, over);
  const error = await postAll(reader, pipe, () => answered);
  if (!answered) {
    pipe.post({ error, id: pipe.id, kind: "load-end" }, []);
  }
  await watching;
}

export { checkResponse, contentLength, streamBody };
export type { Pipe };
