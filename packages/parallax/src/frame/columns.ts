/* A frame's data columns: each one's values, flags, display text and the text a copy takes, matched by index. */

import type { Field, Vector } from "apache-arrow";
import { z } from "zod";

import { exactDecimal } from "#format.ts";

import type { CellFlag, CellValue } from "./cell.ts";
import { FrameError, flagReader, isNumericType, reader, textReader } from "./readers.ts";
import type { Reader } from "./readers.ts";

/** One data column of a frame. */
interface FrameColumn {
  /** The column's identity as the engine produced it. */
  readonly name: string;
  /** The header text, naming the display zone of instants. */
  readonly title: string;
  /** Reads row `row` of the window. */
  readonly value: (row: number) => CellValue;
  /** Reads row `row`'s flag, for measure columns that carry one. */
  readonly flag: (row: number) => CellFlag;
  /** Reads row `row`'s display text. */
  readonly text: (row: number) => string;
  /** Reads row `row`'s text for copying: every digit of numbers and timestamps. */
  readonly copy: (row: number) => string;
  /** `true` for numbers, which align right. */
  readonly numeric: boolean;
  /** `true` when the column's group totals are numbers, which align right on group rows. */
  readonly totalNumeric: boolean;
  /** For a column under column pivots, its pivot values as exact JSON; null otherwise. */
  readonly split: readonly (string | number | boolean | null)[] | null;
  /**
   * For a detail view's column with a total, reads row `row`'s group total, null on the rows themselves; null for
   * other columns. On group rows, `text`, `flag` and `copy` are the total's.
   */
  readonly total: ((row: number) => CellValue) | null;
}

/** A field and its vector. */
interface FieldVector {
  readonly field: Field;
  readonly vector: Vector;
}

/** The fields one data column is made of, found by their role and index. */
interface DataParts {
  readonly value?: FieldVector;
  readonly total?: FieldVector;
  readonly flag?: Vector;
  readonly text?: Vector;
  readonly copy?: Vector;
}

const splitSchema = z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]));

function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new FrameError(`${name}: pivot values are not JSON.`);
  }
}

/** Reads a column's pivot values from its metadata. */
function splitOf(field: Field): FrameColumn["split"] {
  const text = field.metadata.get("parallax.split");
  if (text === undefined) {
    return null;
  }
  const result = splitSchema.safeParse(parseJson(text, field.name));
  if (!result.success) {
    throw new FrameError(`${field.name}: pivot values must be a list of plain values.`);
  }
  return result.data;
}

/** Text for copying a value: every digit, in a form spreadsheets parse; null where the display text serves. */
function exactText(value: CellValue): string | null {
  switch (value.kind) {
    case "number": {
      return Number.isFinite(value.value) ? String(value.value) : null;
    }
    case "integer": {
      return value.value.toString();
    }
    case "decimal": {
      return exactDecimal(value.unscaled, value.scale);
    }
    case "null":
    case "text":
    case "boolean":
    case "date":
    case "timestamp": {
      return null;
    }
    default: {
      return value satisfies never;
    }
  }
}

/** What a cell's copy is made from. */
interface CopyParts {
  readonly flag: (row: number) => CellFlag;
  readonly shown: (row: number) => string;
  readonly copied: ((row: number) => string) | null;
  readonly exact: (row: number) => CellValue;
}

/** The copy of a cell: its display text when flagged, else the engine's copy text, else every digit of its value. */
function copier({ flag, shown, copied, exact }: CopyParts): (row: number) => string {
  return (row) => {
    if (flag(row) !== "ok") {
      return shown(row);
    }
    if (copied !== null) {
      return copied(row);
    }
    return exactText(exact(row)) ?? shown(row);
  };
}

/** A cell's exact value: a group row's total where it has one, else the row's value. */
function exactValue(read: Reader, total: Reader | null): Reader {
  return (row) => {
    const sum = total?.(row);
    return sum === undefined || sum.kind === "null" ? read(row) : sum;
  };
}

/** Builds data column `index` from its parts, refusing one without values or display text. */
function dataColumn(index: number, parts: DataParts, rowCount: number): FrameColumn {
  const { value, text, copy } = parts;
  if (value === undefined || text === undefined) {
    throw new FrameError(`Data column ${String(index)} needs values and display text.`);
  }
  const { field, vector } = value;
  const read = reader(field, vector);
  const flag = flagReader(parts.flag ?? null, rowCount);
  const shown = textReader(`${field.name}#text`, text, rowCount);
  const copied = copy === undefined ? null : textReader(`${field.name}#copy`, copy, rowCount);
  const total = parts.total === undefined ? null : reader(parts.total.field, parts.total.vector);
  return {
    copy: copier({ copied, exact: exactValue(read, total), flag, shown }),
    flag,
    name: field.name,
    numeric: isNumericType(field.type),
    split: splitOf(field),
    text: shown,
    title: field.metadata.get("parallax.title") ?? field.name,
    total,
    totalNumeric: parts.total !== undefined && isNumericType(parts.total.field.type),
    value: read,
  };
}

export { dataColumn };
export type { DataParts, FieldVector, FrameColumn };
