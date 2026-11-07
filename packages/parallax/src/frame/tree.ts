/* The tree columns of a grouped view's frame: each row's depth, kind, whether it is expanded, and its label. */

import type { Vector } from "apache-arrow";

import { FrameError, integerReader, only, textReader } from "./readers.ts";
import type { Reader } from "./readers.ts";
import type { Role } from "./roles.ts";

/** The kinds of a grouped view's rows. */
type RowKind = "total" | "group" | "leaf" | "other" | "row";

/** Tree columns of a grouped view's rows. */
interface TreeRows {
  readonly depth: (row: number) => number;
  /** A row of the table under its innermost group, in a detail view, is a `row`. */
  readonly kind: (row: number) => RowKind;
  readonly expanded: (row: number) => boolean | null;
  readonly label: (row: number) => string;
  /** A detail view's group row's count of rows; null on other rows and in pivots. */
  readonly rows: (row: number) => number | null;
}

/** The four tree columns of a grouped frame. */
interface TreeParts {
  readonly depth: Vector;
  readonly kind: Vector;
  readonly expanded: Vector;
  readonly label: Vector;
}

const rowKinds: readonly RowKind[] = ["total", "group", "leaf", "other", "row"];

function rowKind(value: unknown): RowKind {
  const kind = rowKinds.find((known) => known === value);
  if (kind === undefined) {
    throw new FrameError(`The frame holds an unknown row kind, ${String(value)}.`);
  }
  return kind;
}

/** The tree columns of a grouped frame, all four of them, or null for a frame with none. */
function treeParts(byRole: ReadonlyMap<Role, Vector>): TreeParts | null {
  const depth = byRole.get("depth");
  const kind = byRole.get("kind");
  const expanded = byRole.get("expanded");
  const label = byRole.get("label");
  if (depth === undefined && kind === undefined && expanded === undefined && label === undefined) {
    return null;
  }
  if (depth === undefined || kind === undefined || expanded === undefined || label === undefined) {
    throw new FrameError("A grouped frame needs depth, kind, expanded and label columns.");
  }
  return { depth, expanded, kind, label };
}

function depthReader(vector: Vector): (row: number) => number {
  const depths = only(vector).values;
  if (!(depths instanceof Int32Array)) {
    throw new FrameError("A grouped frame's __depth must be 32-bit integers.");
  }
  return (row) => depths[row] ?? 0;
}

/** Each row's kind, all checked now, so a frame the client does not understand is refused before any grid draws it. */
function kindReader(vector: Vector, rowCount: number): (row: number) => RowKind {
  const kinds = only(vector);
  const kindOfRow = Array.from({ length: rowCount }, (_entry, row) => rowKind(kinds.get(row)));
  return (row) => kindOfRow[row] ?? "leaf";
}

function countReader(counts: Reader | null): (row: number) => number | null {
  function count(row: number): number | null {
    const counted = counts?.(row);
    return counted?.kind === "integer" ? Number(counted.value) : null;
  }
  return count;
}

/** The tree of a grouped frame, or null for a frame with none. */
function treeRows(rowCount: number, byRole: ReadonlyMap<Role, Vector>): TreeRows | null {
  const parts = treeParts(byRole);
  if (parts === null) {
    return null;
  }
  const flags = only(parts.expanded);
  const counted = byRole.get("rows");
  return {
    depth: depthReader(parts.depth),
    expanded: (row) => {
      const value = flags.get(row);
      return typeof value === "boolean" ? value : null;
    },
    kind: kindReader(parts.kind, rowCount),
    label: textReader("__label", parts.label, rowCount),
    rows: countReader(counted === undefined ? null : integerReader("__rows", only(counted))),
  };
}

export { treeRows };
export type { RowKind, TreeRows };
