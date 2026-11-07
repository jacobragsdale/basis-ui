/* The columns of a chart frame's batch, by name, each checked against the type the protocol promises. */

import { DataType } from "apache-arrow";
import type { Table, Vector } from "apache-arrow";

import { FrameError } from "./readers.ts";

/** The rows of one series in a chart batch, from its first to the one after its last. */
type Span = readonly [from: number, to: number];

const largestCount = BigInt(Number.MAX_SAFE_INTEGER);

/** The columns of a chart batch, by name. */
class ChartColumns {
  readonly #table: Table;

  public constructor(table: Table) {
    this.#table = table;
  }

  public has(name: string): boolean {
    return this.#table.schema.fields.some((field) => field.name === name);
  }

  public floats(name: string): Float64Array {
    const vector = this.#vector(name);
    const values: unknown = vector.toArray();
    if (!DataType.isFloat(vector.type) || !(values instanceof Float64Array)) {
      throw new FrameError(`A chart frame's ${name} column must hold doubles.`);
    }
    return values;
  }

  public counts32(name: string): Uint32Array {
    const vector = this.#vector(name);
    const values: unknown = vector.toArray();
    if (!DataType.isInt(vector.type) || !(values instanceof Uint32Array)) {
      throw new FrameError(`A chart frame's ${name} column must hold 32-bit counts.`);
    }
    return values;
  }

  public counts64(name: string): readonly number[] {
    const vector = this.#vector(name);
    const values: unknown = vector.toArray();
    if (!DataType.isInt(vector.type) || !(values instanceof BigUint64Array)) {
      throw new FrameError(`A chart frame's ${name} column must hold 64-bit counts.`);
    }
    return Array.from(values, (value) => {
      if (value > largestCount) {
        throw new FrameError(`A chart frame's ${name} column holds a count past 2^53.`);
      }
      return Number(value);
    });
  }

  public texts(name: string): readonly (string | null)[] {
    const vector = this.#vector(name);
    if (!DataType.isUtf8(vector.type)) {
      throw new FrameError(`A chart frame's ${name} column must hold text.`);
    }
    return Array.from({ length: vector.length }, (_entry, row): string | null => {
      const value: unknown = vector.get(row);
      return typeof value === "string" ? value : null;
    });
  }

  #vector(name: string): Vector {
    const index = this.#table.schema.fields.findIndex((field) => field.name === name);
    const vector = index === -1 ? null : this.#table.getChildAt(index);
    if (vector === null) {
      throw new FrameError(`A chart frame lacks its ${name} column.`);
    }
    return vector;
  }
}

/** Checks that a run of series `id` may end before `next`: the id is listed, and the next run's id is greater. */
function checkRun(id: number | undefined, next: number | undefined, count: number): number {
  if (id === undefined || id >= count) {
    throw new FrameError("A chart frame names a series it does not list.");
  }
  if (next !== undefined && next <= id) {
    throw new FrameError("A chart frame's series must come in order.");
  }
  return id;
}

/** The rows of each of `count` series, which the engine sends one after another, in order of their ids. */
function runs(ids: Uint32Array, count: number): readonly Span[] {
  const spans: Span[] = Array.from({ length: count }, () => [0, 0]);
  let start = 0;
  for (let end = 1; end <= ids.length; end += 1) {
    const next = ids[end];
    if (next !== ids[start]) {
      spans[checkRun(ids[start], next, count)] = [start, end];
      start = end;
    }
  }
  return spans;
}

export { ChartColumns, runs };
export type { Span };
