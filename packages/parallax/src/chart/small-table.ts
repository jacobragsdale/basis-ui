/* The rows of `<Chart>`'s small-data form made into an Arrow table, so a small chart needs no load of its own. Each
 * plotted column takes its type from its values: numbers become doubles, `YYYY-MM-DD` strings dates, other strings
 * text, booleans booleans; null or absent is a missing value. Rows a chart cannot type, such as a column of numbers
 * and text, or a date that is no day, are the chart's own problem, shown in place of the plot, never a throw. */

import { Bool, DateDay, Float64, Table, Utf8, tableToIPC, vectorFromArray } from "apache-arrow";
import type { Vector } from "apache-arrow";

/** A value of a small-data row's plotted column. */
type ChartValue = string | number | boolean | null;

/** A small-data row: an object of the page's, such as a row an API sent, of which the chart reads only the columns it
 * plots, each a number, text, a `YYYY-MM-DD` date or a boolean, and null or absent where it has none. */
type ChartRow = object;

/** What kind of values a column holds, which gives it its type in the table. */
type ColumnKind = "number" | "boolean" | "date" | "text";

/** The rows made into a table: its Arrow bytes, each column's kind, and the first column's values in the rows' order;
 * or, for rows a chart cannot draw, why, and no bytes. */
interface SmallTable {
  readonly bytes: ArrayBuffer | null;
  readonly problem: string | null;
  readonly kinds: Readonly<Record<string, ColumnKind>>;
  readonly xValues: readonly ChartValue[];
}

/** A column made, or why it could not be. */
type Made = { readonly kind: ColumnKind; readonly vector: Vector } | { readonly problem: string };

const isoDate = /^\d{4}-\d{2}-\d{2}$/u;
/** The `YYYY-MM-DD` of an ISO timestamp. */
const dateLength = 10;

/** A row's value of column `name`, null where it has none. */
function valueIn(row: object, name: string): unknown {
  const value: unknown = Object.getOwnPropertyDescriptor(row, name)?.value;
  return value === undefined || (typeof value === "number" && !Number.isFinite(value))
    ? null
    : value;
}

/**
 * The rows' columns `columns`, the x column first, as text: the same for rows of the same content, however often
 * the page builds them, so that the table is made and loaded again only when what it draws changes. Only those
 * columns are read.
 */
function tableContent(rows: readonly ChartRow[], columns: readonly string[]): string {
  return JSON.stringify([columns, columns.map((name) => rows.map((row) => valueIn(row, name)))]);
}

/** Whether `text` is a real day of the calendar written `YYYY-MM-DD`: not `2026-02-30` or `2026-13-01`. */
function isDay(text: string): boolean {
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, dateLength) === text;
}

/** The kind of a value a column can hold, before text is told from dates, or null for any other. */
function kindOfValue(value: unknown): "number" | "boolean" | "string" | null {
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return typeof value === "string" ? "string" : null;
}

function isChartValue(value: unknown): value is ChartValue {
  return value === null || kindOfValue(value) !== null;
}

/** A column of text: dates when every value is written `YYYY-MM-DD`, each of which must then be a real day. */
function textColumn(name: string, values: readonly unknown[]): Made {
  const texts = values.map((value) => (typeof value === "string" ? value : null));
  if (!texts.every((text) => text === null || isoDate.test(text))) {
    return { kind: "text", vector: vectorFromArray(texts, new Utf8()) };
  }
  const bad = texts.findIndex((text) => text !== null && !isDay(text));
  if (bad !== -1) {
    return {
      problem: `Column ${name} holds ${JSON.stringify(texts[bad])} in row ${String(bad + 1)}, which is not a day: give its dates as YYYY-MM-DD`,
    };
  }
  const days = texts.map((text) => (text === null ? null : new Date(`${text}T00:00:00Z`)));
  return { kind: "date", vector: vectorFromArray(days, new DateDay()) };
}

/** A column of numbers, booleans or text, as the one kind its values share. */
function typedColumn(
  name: string,
  kind: "number" | "boolean" | "string",
  values: readonly unknown[],
): Made {
  if (kind === "string") {
    return textColumn(name, values);
  }
  return kind === "boolean"
    ? { kind, vector: vectorFromArray(values, new Bool()) }
    : { kind, vector: vectorFromArray(values, new Float64()) };
}

/** A column's values as an Arrow vector of the kind they share, or why they share none. */
function columnOf(name: string, values: readonly unknown[]): Made {
  const at = (index: number): string =>
    `${JSON.stringify(values[index])} in row ${String(index + 1)}`;
  const kinds = values.map((value) => (value === null ? undefined : kindOfValue(value)));
  const odd = kinds.indexOf(null);
  if (odd !== -1) {
    return {
      problem: `Column ${name} holds ${at(odd)}: give a chart's columns numbers, text, YYYY-MM-DD dates or booleans, and null where a row has none`,
    };
  }
  const first = kinds.find((kind) => kind !== undefined) ?? "number";
  const other = kinds.findIndex((kind) => kind !== undefined && kind !== first);
  return other === -1
    ? typedColumn(name, first, values)
    : {
        problem: `Column ${name} mixes kinds of value, such as ${at(other)}: give each of a chart's columns one kind, and null where a row has none`,
      };
}

/** `tableContent`'s text read back: the columns' names, and each column's values. */
function parseContent(
  content: string,
): readonly [readonly string[], readonly (readonly unknown[])[]] {
  const parsed: unknown = JSON.parse(content);
  const parts: readonly unknown[] = Array.isArray(parsed) ? parsed : [];
  const [names, lists] = parts;
  const columns: readonly unknown[] = Array.isArray(names) ? names : [];
  const values: readonly unknown[] = Array.isArray(lists) ? lists : [];
  return [
    columns.filter((name) => typeof name === "string"),
    values.map((list): readonly unknown[] => (Array.isArray(list) ? list : [])),
  ];
}

/** The rows' columns, as `tableContent` writes them, made into a table: its Arrow IPC stream, or why the rows cannot
 * be drawn. */
function smallTable(content: string): SmallTable {
  const [columns, values] = parseContent(content);
  const made = columns.map((name, index) => [name, columnOf(name, values[index] ?? [])] as const);
  const failed = made.find(([, column]) => "problem" in column)?.[1];
  if (failed !== undefined && "problem" in failed) {
    return { bytes: null, kinds: {}, problem: failed.problem, xValues: [] };
  }
  const vectors = Object.fromEntries(
    made.flatMap(([name, column]) => ("vector" in column ? [[name, column.vector]] : [])),
  );
  const kinds = Object.fromEntries(
    made.flatMap(([name, column]) => ("kind" in column ? [[name, column.kind]] : [])),
  );
  const bytes = new Uint8Array(tableToIPC(new Table(vectors), "stream")).buffer;
  return {
    bytes,
    kinds,
    problem: null,
    xValues: (values[0] ?? []).filter((value) => isChartValue(value)),
  };
}

export { smallTable, tableContent };
export type { ChartRow, ChartValue, ColumnKind, SmallTable };
