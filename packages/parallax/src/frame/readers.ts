/* Readers of a frame's Arrow columns, each checked against the type the engine promises before any UI code reads it.
 *
 * Values are read from the raw Arrow buffers rather than Arrow JS's convenience getters: those turn microsecond
 * timestamps into fractional milliseconds and decimals into objects, and either would lose digits. */

import { DataType } from "apache-arrow";
import type { Field, Vector } from "apache-arrow";

import { cellFlags } from "./cell.ts";
import type { CellFlag, CellValue } from "./cell.ts";

/** A frame the client cannot trust. */
class FrameError extends Error {
  public override readonly name = "FrameError";
}

/** The single chunk of a frame column, with its values typed as unknown until checked. */
interface Chunk {
  readonly values: unknown;
  readonly valid: (row: number) => boolean;
  readonly get: (row: number) => unknown;
}

/** Reads a row of a column. */
type Reader = (row: number) => CellValue;

const wordsPerDecimal = 4;
const decimalBits = 128;
// 2 to the 32nd, one word's worth.
const wordBase = 4_294_967_296n;
const zero = 0n;
const nullValue: CellValue = { kind: "null" };

function only(vector: Vector): Chunk {
  const first = vector.data.at(0);
  if (first === undefined || vector.data.length > 1) {
    throw new FrameError("A frame must hold exactly one record batch.");
  }
  const values: unknown = first.values;
  return {
    get: (row) => {
      const value: unknown = vector.get(row);
      return value;
    },
    valid: (row) => first.getValid(row),
    values,
  };
}

/** Reconstructs a signed 128-bit integer from four little-endian 32-bit words. */
function decimalFromWords(words: Uint32Array, offset: number): bigint {
  let value = zero;
  for (let word = wordsPerDecimal - 1; word >= 0; word -= 1) {
    value = value * wordBase + BigInt(words[offset + word] ?? 0);
  }
  return BigInt.asIntN(decimalBits, value);
}

function numberReader(name: string, chunk: Chunk): Reader {
  const { values } = chunk;
  if (!(values instanceof Float64Array)) {
    throw new FrameError(`${name}: expected 64-bit floats.`);
  }
  return (row) =>
    chunk.valid(row) ? { kind: "number", value: values[row] ?? Number.NaN } : nullValue;
}

function integerReader(name: string, chunk: Chunk): Reader {
  const { values } = chunk;
  if (values instanceof BigInt64Array) {
    return (row) =>
      chunk.valid(row) ? { kind: "integer", value: values[row] ?? zero } : nullValue;
  }
  if (values instanceof Int32Array) {
    return (row) =>
      chunk.valid(row) ? { kind: "integer", value: BigInt(values[row] ?? 0) } : nullValue;
  }
  throw new FrameError(`${name}: unsupported integer width.`);
}

function decimalReader(name: string, chunk: Chunk, type: unknown): Reader {
  const { values } = chunk;
  if (
    !DataType.isDecimal(type) ||
    !(values instanceof Uint32Array) ||
    type.bitWidth !== decimalBits
  ) {
    throw new FrameError(`${name}: expected a 128-bit decimal.`);
  }
  const { scale } = type;
  return (row) =>
    chunk.valid(row)
      ? { kind: "decimal", scale, unscaled: decimalFromWords(values, row * wordsPerDecimal) }
      : nullValue;
}

function textValueReader(chunk: Chunk): Reader {
  return (row) => {
    const text = chunk.get(row);
    return typeof text === "string" ? { kind: "text", value: text } : nullValue;
  };
}

function booleanReader(chunk: Chunk): Reader {
  return (row) => {
    const flag = chunk.get(row);
    return typeof flag === "boolean" ? { kind: "boolean", value: flag } : nullValue;
  };
}

function dateReader(name: string, chunk: Chunk): Reader {
  const { values } = chunk;
  if (!(values instanceof Int32Array)) {
    throw new FrameError(`${name}: expected day-precision dates.`);
  }
  return (row) => (chunk.valid(row) ? { days: values[row] ?? 0, kind: "date" } : nullValue);
}

function timestampReader(name: string, chunk: Chunk, type: unknown): Reader {
  const { values } = chunk;
  if (!DataType.isTimestamp(type) || !(values instanceof BigInt64Array)) {
    throw new FrameError(`${name}: expected 64-bit timestamps.`);
  }
  const zoned = type.timezone !== null;
  return (row) =>
    chunk.valid(row) ? { kind: "timestamp", micros: values[row] ?? zero, zoned } : nullValue;
}

/** The reader for a column of any type the engine sends. */
function reader(field: Field, vector: Vector): Reader {
  const chunk = only(vector);
  const type: unknown = field.type;
  const { name } = field;
  const readers: readonly (readonly [(type: unknown) => boolean, () => Reader])[] = [
    [(of) => DataType.isFloat(of), () => numberReader(name, chunk)],
    [(of) => DataType.isInt(of), () => integerReader(name, chunk)],
    [(of) => DataType.isDecimal(of), () => decimalReader(name, chunk, type)],
    [(of) => DataType.isUtf8(of), () => textValueReader(chunk)],
    [(of) => DataType.isBool(of), () => booleanReader(chunk)],
    [(of) => DataType.isDate(of), () => dateReader(name, chunk)],
    [(of) => DataType.isTimestamp(of), () => timestampReader(name, chunk, type)],
  ];
  const found = readers.find(([matches]) => matches(type));
  if (found === undefined) {
    throw new FrameError(`${name}: unsupported type ${String(type)}.`);
  }
  return found[1]();
}

function cellFlag(value: number): CellFlag {
  const flag = cellFlags[value];
  if (flag === undefined) {
    throw new FrameError(`The frame holds an unknown cell flag, ${String(value)}.`);
  }
  return flag;
}

/* Flags and text are checked for every row when a frame is decoded, so a frame the client cannot draw is refused
 * before any grid reads it. */

function flagReader(vector: Vector | null, rowCount: number): (row: number) => CellFlag {
  if (vector === null) {
    return () => "ok";
  }
  const { values } = only(vector);
  if (!(values instanceof Uint8Array)) {
    throw new FrameError("A frame's flag columns must be 8-bit.");
  }
  const flags = Array.from({ length: rowCount }, (_entry, row) => cellFlag(values[row] ?? 0));
  return (row) => flags[row] ?? "ok";
}

/**
 * Reads a column of text. A frame with a row missing its text is refused here, before any grid draws it, but each
 * row is decoded only when it is first read: a small view is fetched whole, and a grid draws only the rows in view.
 */
function textReader(name: string, vector: Vector, rowCount: number): (row: number) => string {
  const chunk = only(vector);
  if (vector.nullCount > 0) {
    throw new FrameError(`${name}: display text is missing.`);
  }
  const texts = new Map<number, string>();
  function read(row: number): string {
    const known = texts.get(row);
    if (known !== undefined) {
      return known;
    }
    const text = row >= 0 && row < rowCount ? chunk.get(row) : null;
    const value = typeof text === "string" ? text : "";
    texts.set(row, value);
    return value;
  }
  return read;
}

/** Returns `true` for the Arrow types that hold numbers. */
function isNumericType(type: unknown): boolean {
  return DataType.isFloat(type) || DataType.isInt(type) || DataType.isDecimal(type);
}

export {
  FrameError,
  decimalFromWords,
  flagReader,
  integerReader,
  isNumericType,
  only,
  reader,
  textReader,
};
export type { Chunk, Reader };
