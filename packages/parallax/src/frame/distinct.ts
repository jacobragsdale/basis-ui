/* The values the engine lists for a filter's pick-list: each value, its display text, and how many rows hold it. */

import { Table, tableFromIPC } from "apache-arrow";

import type { CellValue } from "./cell.ts";
import { FrameError, reader, textReader } from "./readers.ts";
import type { FieldVector } from "./columns.ts";

/** One value of a column with its display text and how many rows hold it. */
interface DistinctValue {
  readonly value: CellValue;
  readonly text: string;
  readonly rows: bigint;
}

function columnOf(table: Table, name: string): FieldVector {
  const index = table.schema.fields.findIndex((field) => field.name === name);
  const vector = table.getChildAt(index);
  const found = table.schema.fields[index];
  if (found === undefined || vector === null) {
    throw new FrameError(`A filter's distinct values need a ${name} column.`);
  }
  return { field: found, vector };
}

/** Decodes and checks the values the engine lists for a filter. */
function decodeDistinct(bytes: Uint8Array): readonly DistinctValue[] {
  const table = tableFromIPC(bytes);
  if (!(table instanceof Table)) {
    throw new FrameError("A filter's distinct values must decode synchronously.");
  }
  const value = columnOf(table, "value");
  const count = columnOf(table, "count");
  const read = reader(value.field, value.vector);
  const text = textReader("text", columnOf(table, "text").vector, table.numRows);
  const counts = reader(count.field, count.vector);
  return Array.from({ length: table.numRows }, (_entry, row) => {
    const rows = counts(row);
    if (rows.kind !== "integer") {
      throw new FrameError("A filter's distinct-value counts must be integers.");
    }
    return { rows: rows.value, text: text(row), value: read(row) };
  });
}

export { decodeDistinct };
export type { DistinctValue };
