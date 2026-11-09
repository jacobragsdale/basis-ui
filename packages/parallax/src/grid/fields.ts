/* A dataset's columns, as a grid's menus offer them: each one's name, the kind of value it holds and the display
 * format its API declares, read from the schema the engine sends when a view opens. */

import { DataType, tableFromIPC } from "apache-arrow";

import { declaredFormats } from "#chart/axis-styles.ts";
import { isNumericType } from "#frame/readers.ts";
import type { LayoutFormat } from "#layout/layout.ts";

/** The kind of value a column holds. */
type FieldKind = "boolean" | "integer" | "float" | "decimal" | "text" | "date" | "timestamp";

/** A column of the dataset. */
interface SourceField {
  readonly name: string;
  readonly kind: FieldKind;
  /** The display format the column's API declares under `basis.format`, as a layout format; absent without one. */
  readonly format?: LayoutFormat;
}

function numberKind(type: unknown): FieldKind {
  if (DataType.isInt(type)) {
    return "integer";
  }
  return DataType.isFloat(type) ? "float" : "decimal";
}

function kindOf(type: unknown): FieldKind {
  if (DataType.isBool(type)) {
    return "boolean";
  }
  if (isNumericType(type)) {
    return numberKind(type);
  }
  if (DataType.isDate(type)) {
    return "date";
  }
  return DataType.isTimestamp(type) ? "timestamp" : "text";
}

/** The columns of a table, from its schema as Arrow IPC bytes; none for empty bytes. */
function readFields(schema: Uint8Array): readonly SourceField[] {
  if (schema.length === 0) {
    return [];
  }
  const declared = declaredFormats(schema);
  return tableFromIPC(schema).schema.fields.map((field): SourceField => {
    const [kind, name, format] = [kindOf(field.type), field.name, declared[field.name]];
    return format === undefined ? { kind, name } : { format, kind, name };
  });
}

export { readFields };
export type { FieldKind, SourceField };
