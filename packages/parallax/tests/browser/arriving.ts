/* A dataset whose response arrives in two parts, the second held back until the test releases it, as a large table's
 * body arrives over a slow network: its first record batch comes at once, and the rest when the test says. */

import { Table, makeVector, tableToIPC } from "apache-arrow";

/** The rows of each of the stream's record batches. */
const batchRows = 1000;

/** A stream of `batches` record batches of {@link batchRows} rows, one column `value` numbering them from 0, and the
 * length of its first part: its schema and its first batch. */
function batchedStream(batches: number): { readonly bytes: Uint8Array; readonly first: number } {
  const tables = Array.from(
    { length: batches },
    (_entry, batch) =>
      new Table({
        value: makeVector(
          Float64Array.from({ length: batchRows }, (_value, row) => batch * batchRows + row),
        ),
      }),
  );
  const bytes = tableToIPC(new Table(tables.flatMap((table) => table.batches)), "stream");
  const firstOnly = tableToIPC(new Table(tables[0]?.batches ?? []), "stream");
  // The end-of-stream marker, which only the whole stream's end has, is the first stream's last 8 bytes.
  const endOfStream = 8;
  return { bytes, first: firstOnly.byteLength - endOfStream };
}

/** A response with its length whose body sends its first `first` bytes at once and the rest once `release` is
 * called. */
interface Arriving {
  readonly response: Response;
  readonly release: () => void;
}

function arriving({
  bytes,
  first,
}: {
  readonly bytes: Uint8Array;
  readonly first: number;
}): Arriving {
  const { promise: gate, resolve } = Promise.withResolvers<null>();
  const body = new ReadableStream<Uint8Array>({
    start: async (controller): Promise<void> => {
      controller.enqueue(bytes.slice(0, first));
      await gate;
      controller.enqueue(bytes.slice(first));
      controller.close();
    },
  });
  return {
    release: () => {
      resolve(null);
    },
    response: new Response(body, { headers: { "content-length": String(bytes.byteLength) } }),
  };
}

export { arriving, batchRows, batchedStream };
export type { Arriving };
