/* Frames: windows of a view, decoded from Arrow IPC.
 *
 * A frame crosses an I/O boundary, so every column is checked against the type the engine promises before any UI code
 * reads it. Each field names its role in its metadata, and data columns are matched to their flags and text by index,
 * never by name: names are for people and can repeat.
 *
 * Display text comes from the engine's formatter, the one the Excel export uses, so the screen and the export agree. */

import { RecordBatchReader, Table } from "apache-arrow";
import type { Field, Vector } from "apache-arrow";

import type { Frame } from "#proto/parallax_pb.ts";

import type { CellValue } from "./cell.ts";
import { dataColumn } from "./columns.ts";
import type { DataParts, FrameColumn } from "./columns.ts";
import { FrameError, reader } from "./readers.ts";
import { indexOf, roleOf } from "./roles.ts";
import type { Role } from "./roles.ts";
import { treeRows } from "./tree.ts";
import type { TreeRows } from "./tree.ts";

/** The key of one group level, on every row of a grouped view. */
interface GroupKey {
  readonly name: string;
  readonly value: (row: number) => CellValue;
}

/** A decoded, validated window of a view. */
interface FrameData {
  readonly viewId: number;
  readonly configVersion: bigint;
  readonly loadVersion: bigint;
  readonly firstRow: number;
  readonly firstColumn: number;
  readonly rowCount: number;
  readonly totalRows: number;
  readonly totalColumns: number;
  readonly sourceAsOfMicros: bigint;
  readonly pushed: boolean;
  /** When the grid asked for the rows this frame answers, by `performance.now()`; absent for frames nobody asked for. */
  readonly requestedAtMs?: number;
  /** When the layout change this frame is the first answer to was sent, by `performance.now()`; absent otherwise. */
  readonly changedAtMs?: number;
  /** Data columns, in display order. */
  readonly columns: readonly FrameColumn[];
  /** Group keys from the outermost level, for grouped views. */
  readonly groups: readonly GroupKey[];
  /** Present for grouped views. */
  readonly tree: TreeRows | null;
  /** The totals row's data columns, as `columns` are, read at row 0; null for a view without totals. */
  readonly totals: readonly FrameColumn[] | null;
  /** The domain of the data columns a layout draws by value, as `columns` are: the least value at row 0 and the
   * greatest at row 1, over the rows that pass the filters; null where the engine gives none. */
  readonly domains: readonly FrameColumn[] | null;
}

/** The fields of a batch filed by role: tree columns, group keys, and each data column's parts. */
interface Filed {
  readonly byRole: Map<Role, Vector>;
  readonly data: Map<number, DataParts>;
  readonly groups: Map<number, GroupKey>;
}

/** The parts of a decoded batch: its data columns, group keys and the fields of each other role. */
interface Decoded {
  readonly rowCount: number;
  readonly columns: readonly FrameColumn[];
  readonly groups: readonly GroupKey[];
  readonly byRole: ReadonlyMap<Role, Vector>;
}

/** Files one of a data column's parts under the column's index, refusing a second of the same role. */
function addPart(data: Map<number, DataParts>, field: Field, part: DataParts): void {
  const index = indexOf(field, "parallax.index");
  const parts = data.get(index) ?? {};
  const [role] = Object.keys(part);
  if (role !== undefined && role in parts) {
    throw new FrameError(`Data column ${String(index)} has two ${role} columns.`);
  }
  data.set(index, { ...parts, ...part });
}

function file(filed: Filed, field: Field, vector: Vector): void {
  const role = roleOf(field);
  if (role === "group") {
    filed.groups.set(indexOf(field, "parallax.level"), {
      name: field.name,
      value: reader(field, vector),
    });
  } else if (role === "value" || role === "total") {
    addPart(filed.data, field, { [role]: { field, vector } });
  } else if (role === "flag" || role === "text" || role === "copy") {
    addPart(filed.data, field, { [role]: vector });
  } else {
    filed.byRole.set(role, vector);
  }
}

/**
 * Reads an Arrow IPC stream as a table with the schema the stream declares. A frame's field names can repeat, as a
 * detail view's group key beside the same column's values, or two equal measures. Arrow JS gives each batch it reads a
 * schema that merges the metadata of fields sharing a name (`Schema.assign`), which would file a group key as a second
 * value. So the table keeps the declared schema, and its vectors match it by position.
 */
function readTable(bytes: Uint8Array): Table {
  const batches = RecordBatchReader.from(bytes);
  if (!batches.isSync()) {
    throw new FrameError("A frame's batch must decode synchronously.");
  }
  const declared = batches.open().schema;
  return new Table(declared, [...batches]);
}

/** Lists the entries of a map keyed 0, 1, 2 and on, refusing a gap. */
function numbered<Entry>(entries: ReadonlyMap<number, Entry>, what: string): readonly Entry[] {
  return Array.from({ length: entries.size }, (_entry, index) => {
    const entry = entries.get(index);
    if (entry === undefined) {
      throw new FrameError(
        `A frame's ${what} must be numbered from 0; ${String(index)} is missing.`,
      );
    }
    return entry;
  });
}

/** Decodes one Arrow IPC stream of one batch into its data columns and roles. */
function decodeBatch(bytes: Uint8Array): Decoded {
  const table = readTable(bytes);
  const filed: Filed = { byRole: new Map(), data: new Map(), groups: new Map() };
  for (const [index, field] of table.schema.fields.entries()) {
    const vector = table.getChildAt(index);
    if (vector === null) {
      throw new FrameError(`The frame lacks its column ${field.name}.`);
    }
    file(filed, field, vector);
  }
  return {
    byRole: filed.byRole,
    columns: numbered(filed.data, "data columns").map((parts, index) =>
      dataColumn(index, parts, table.numRows),
    ),
    groups: numbered(filed.groups, "group levels"),
    rowCount: table.numRows,
  };
}

/** The totals row of a frame, checked against its data columns. */
function decodeTotals(bytes: Uint8Array, columns: number): readonly FrameColumn[] | null {
  if (bytes.length === 0) {
    return null;
  }
  const row = decodeBatch(bytes);
  if (row.rowCount !== 1 || row.columns.length !== columns) {
    throw new FrameError("A frame's totals must be one row with the frame's data columns.");
  }
  return row.columns;
}

/** The domains of a frame's data columns, checked against them: two rows, the least and the greatest value. */
function decodeDomains(bytes: Uint8Array, columns: number): readonly FrameColumn[] | null {
  if (bytes.length === 0) {
    return null;
  }
  const rows = decodeBatch(bytes);
  if (rows.rowCount !== 2 || rows.columns.length !== columns) {
    throw new FrameError("A frame's domains must be two rows with the frame's data columns.");
  }
  return rows.columns;
}

/** Decodes and validates a frame. */
function decodeFrame(frame: Frame): FrameData {
  const { rowCount, columns, groups, byRole } = decodeBatch(frame.batch);
  return {
    columns,
    configVersion: frame.configVersion,
    domains: decodeDomains(frame.domains, columns.length),
    firstColumn: frame.firstColumn,
    firstRow: Number(frame.firstRow),
    groups,
    loadVersion: frame.loadVersion,
    pushed: frame.pushed,
    rowCount,
    sourceAsOfMicros: frame.sourceAsOfMicros,
    totalColumns: frame.totalColumns,
    totalRows: Number(frame.totalRows),
    totals: decodeTotals(frame.totals, columns.length),
    tree: treeRows(rowCount, byRole),
    viewId: frame.viewId,
  };
}

export { decodeFrame };
export type { FrameData, GroupKey };
