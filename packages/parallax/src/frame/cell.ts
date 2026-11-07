/* A cell as a frame holds it: its value typed by what the engine sent, and the flag the engine sets on a measure it
 * could not compute exactly. */

/** A cell value, typed by what the engine sent. */
type CellValue =
  | { readonly kind: "null" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "integer"; readonly value: bigint }
  | { readonly kind: "decimal"; readonly unscaled: bigint; readonly scale: number }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "date"; readonly days: number }
  | { readonly kind: "timestamp"; readonly micros: bigint; readonly zoned: boolean };

/**
 * The flag beside each measure's cell: `ok`, or why the cell shows no number. `overflow` is an exact result past 38
 * digits, `mixed` a group of values in different units, and `undefined` a result with no value, such as a mean of no
 * rows.
 */
type CellFlag = "ok" | "overflow" | "mixed" | "undefined";

/** The flags in the order the engine numbers them. */
const cellFlags: readonly CellFlag[] = ["ok", "overflow", "mixed", "undefined"];

export { cellFlags };
export type { CellFlag, CellValue };
