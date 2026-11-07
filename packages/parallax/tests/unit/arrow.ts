/* Arrow data for the frame tests, written as the engine writes its frames. */

import { create } from "@bufbuild/protobuf";
import {
  Decimal,
  Field,
  Float64,
  Int64,
  RecordBatch,
  RecordBatchStreamWriter,
  Schema,
  Struct,
  Utf8,
  makeData,
} from "apache-arrow";
import type { Data, DataType } from "apache-arrow";

import { FrameSchema } from "#proto/parallax_pb.ts";
import type { Frame } from "#proto/parallax_pb.ts";

/** A frame field and its data. */
interface Column {
  readonly field: Field;
  readonly data: Data;
}

const wordBase = 4_294_967_296n;
const wordsPerDecimal = 4;
const bitsPerByte = 8;
const decimalBits = 128;
const decimalPrecision = 38;
const zero = 0n;

/** A field with its role and other metadata, and its data. */
function column(
  field: { readonly name: string; readonly type: DataType; readonly role: string },
  data: Data,
  extra: Readonly<Record<string, string>> = {},
): Column {
  const metadata = new Map(Object.entries({ "parallax.role": field.role, ...extra }));
  return { data, field: new Field(field.name, field.type, true, metadata) };
}

/** A column of text, every row present. */
function text(values: readonly string[]): Data<Utf8> {
  const encoder = new TextEncoder();
  const encoded = values.map((value) => encoder.encode(value));
  const offsets = new Int32Array(values.length + 1);
  for (const [index, bytes] of encoded.entries()) {
    offsets[index + 1] = (offsets[index] ?? 0) + bytes.length;
  }
  const data = new Uint8Array(offsets[values.length] ?? 0);
  for (const [index, bytes] of encoded.entries()) {
    data.set(bytes, offsets[index] ?? 0);
  }
  return makeData({ data, length: values.length, type: new Utf8(), valueOffsets: offsets });
}

/** A validity bitmap: bit `i` set when row `i` holds a value. */
function bits(valid: readonly boolean[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(valid.length / bitsPerByte));
  for (const [index, present] of valid.entries()) {
    if (present) {
      const byte = Math.floor(index / bitsPerByte);
      out[byte] = (out[byte] ?? 0) + 2 ** (index % bitsPerByte);
    }
  }
  return out;
}

/** 64-bit integers, null where a value is null. */
function ints(values: readonly (bigint | null)[]): Data {
  return makeData({
    data: BigInt64Array.from(values.map((value) => value ?? zero)),
    length: values.length,
    nullBitmap: bits(values.map((value) => value !== null)),
    nullCount: values.filter((value) => value === null).length,
    type: new Int64(),
  });
}

/** Doubles, every row present. */
function floats(values: readonly number[]): Data {
  return makeData({ data: new Float64Array(values), length: values.length, type: new Float64() });
}

/** The four little-endian words of each 128-bit decimal, at scale 2. */
function decimals(values: readonly bigint[]): Data<Decimal> {
  const words = new Uint32Array(values.length * wordsPerDecimal);
  for (const [row, value] of values.entries()) {
    let rest = BigInt.asUintN(decimalBits, value);
    for (let word = 0; word < wordsPerDecimal; word += 1) {
      words[row * wordsPerDecimal + word] = Number(rest % wordBase);
      rest /= wordBase;
    }
  }
  return makeData({
    data: words,
    length: values.length,
    type: new Decimal(2, decimalPrecision, decimalBits),
  });
}

/**
 * A frame's Arrow IPC stream, written with its declared schema as the engine writes it: an Arrow JS batch's own schema
 * merges the metadata of fields that share a name.
 */
function frameOf(columns: readonly Column[], rows: number): Uint8Array {
  const schema = new Schema(columns.map((entry) => entry.field));
  const struct = makeData({
    children: columns.map((entry) => entry.data),
    length: rows,
    nullCount: 0,
    type: new Struct(schema.fields),
  });
  const writer = new RecordBatchStreamWriter();
  writer.reset(undefined, schema);
  writer.write(new RecordBatch(schema, struct));
  writer.finish();
  return writer.toUint8Array(true);
}

/** A frame message holding the columns. */
function frameMessage(columns: readonly Column[], rows: number, totals?: Uint8Array): Frame {
  return create(FrameSchema, {
    batch: frameOf(columns, rows),
    totalColumns: 2,
    totalRows: BigInt(rows),
    viewId: 1,
    ...(totals === undefined ? {} : { totals }),
  });
}

export { bits, column, decimals, floats, frameMessage, frameOf, ints, text };
export type { Column };
