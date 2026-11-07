/* Chart batches for the chart frame tests, written as the engine writes them: text columns are plain UTF-8, not
 * dictionaries. */

import { create } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { Table, Utf8, tableFromArrays, tableToIPC, vectorFromArray } from "apache-arrow";
import type { Vector } from "apache-arrow";

import { ChartFrameSchema } from "#proto/parallax_pb.ts";
import type { ChartFrame } from "#proto/parallax_pb.ts";

type NumericColumn = Float64Array | Uint32Array | BigUint64Array;
type ChartColumns = Readonly<Record<string, NumericColumn | readonly (string | null)[]>>;

function isNumeric(entry: readonly [string, unknown]): entry is [string, NumericColumn] {
  return !Array.isArray(entry[1]);
}

/** A chart batch's Arrow IPC stream. */
function batch(columns: ChartColumns): Uint8Array {
  const numeric = tableFromArrays(
    Object.fromEntries(Object.entries(columns).filter((entry) => isNumeric(entry))),
  );
  const vectors: Record<string, Vector> = {};
  for (const [name, values] of Object.entries(columns)) {
    const vector = Array.isArray(values)
      ? vectorFromArray(values, new Utf8())
      : numeric.getChild(name);
    if (vector === null) {
      throw new Error(`The batch lacks its column ${name}.`);
    }
    vectors[name] = vector;
  }
  return tableToIPC(new Table(vectors));
}

/** A chart frame message over the columns, with a ten-wide x range and one tick unless `extra` says otherwise. */
function chartFrame(
  columns: ChartColumns,
  extra: Omit<MessageInitShape<typeof ChartFrameSchema>, "$typeName"> = {},
): ChartFrame {
  return create(ChartFrameSchema, {
    batch: batch(columns),
    extentFrom: 0,
    extentTo: 10,
    ticks: [{ label: "Jan 2", x: 0 }],
    viewId: 3,
    xFrom: 0,
    xTo: 10,
    ...extra,
  });
}

export { batch, chartFrame };
