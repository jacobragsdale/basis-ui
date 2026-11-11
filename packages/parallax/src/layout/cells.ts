/* How a flat or detail view's cells draw, by column: as a data bar, a heat fill, a badge, a sparkline or a link, rather
 * than as text, and the conditional formats that style them. They mirror the Rust types in `parallax-protocol`'s
 * `layout/cells.rs`, defaults and all, so that a layout comes back from the engine unchanged. */

import { z } from "zod";

import { filterOps, name, scalar } from "./scalars.ts";

/** A status's colour and shape, from the theme. */
const tones = ["positive", "negative", "warning", "info", "neutral"] as const;
const toneSchema = z.enum(tones);
/** The tone of each badge's value, by its text. */
const toneByValue = z.record(z.string(), toneSchema);

const cellSchema = z.discriminatedUnion("kind", [
  /** A bar as long as the value over the column's domain, behind its text: from zero, so a loss runs left, or from the
   * column's least value. */
  z.strictObject({ kind: z.literal("bar"), from: z.enum(["zero", "min"]).default("zero") }),
  /** A fill by value, from the column's least to its greatest, or diverging about zero, under ink that reads on it. */
  z.strictObject({
    kind: z.literal("heat"),
    /** From the least value to the greatest, or diverging about zero. */
    scale: z.enum(["sequential", "diverging"]).default("sequential"),
  }),
  /** A pill with the value's text, in the tone listed for it; a value not listed is neutral. */
  z.strictObject({
    kind: z.literal("badge"),
    /** The tone of each value, by its text. */
    values: toneByValue.default({}),
  }),
  /** A small line of the numbers in a text cell, separated by spaces or commas, such as `101.2 101.5 100.9`. */
  z.strictObject({ kind: z.literal("sparkline") }),
  /** Text that reports a click to the app, through the grid's `onCellClick`. */
  z.strictObject({ kind: z.literal("link") }),
]);

const ruleSchema = z.strictObject({
  /** The condition on the cell's value, with a filter's operators and operands. */
  when: z.strictObject({
    /** The operator, as a filter's, such as `gt` or `contains`. */
    op: z.enum(filterOps),
    /** The operand of an operator that takes one value. */
    value: scalar.default(null),
    /** The operands of `in` and `not_in`. */
    values: z.array(scalar).default([]),
  }),
  /** The style: the text in a tone's ink, a fill in its tint, and bold. */
  format: z.strictObject({
    /** The text's ink: a tone's, or the column's for none. */
    tone: toneSchema.nullable().default(null),
    /** A fill in the tone's tint behind the cell. */
    fill: z.boolean().default(false),
    /** The text in the group font. */
    bold: z.boolean().default(false),
  }),
});

/** The layout's fields for cells. The Rust leaves them out of a layout that sets none, so they have no default. */
const cellFields = {
  /** How a flat or detail view's cells draw, by source column, such as `{ pnl: { kind: "bar" } }`. The engine gives
   * each frame the domain of a flat view's bar and heat columns. */
  cells: z.record(name, cellSchema).optional(),
  /** Conditional formats by source column, such as `{ price: [{ when: { op: "lt", value: 95 }, format: { tone:
   * "negative" } }] }`: the first rule whose condition a cell's value meets styles it. */
  rules: z.record(name, z.array(ruleSchema)).optional(),
};

/** How one column's cells draw. */
type LayoutCell = z.output<typeof cellSchema>;
/** A conditional format. */
type LayoutRule = z.output<typeof ruleSchema>;
/** A status's tone. */
type Tone = (typeof tones)[number];

export { cellFields, tones };
export type { LayoutCell, LayoutRule, Tone };
