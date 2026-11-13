/* A grid's copy as tab-separated text: a text cell that starts like a formula pastes as text, as `@basis/ui`'s
 * writers make it, and a number's text, negative or not, is copied as it is. */

import { Float64, Utf8 } from "apache-arrow";
import { describe, expect, test } from "vite-plus/test";

import { decodeFrame } from "#frame/frame.ts";
import { rangeText } from "#grid/copy.ts";

import { column, floats, frameMessage, text } from "./arrow.ts";

const noteValues = ["=1+1", "@SUM(A1)", "plain"];
/** A data column's values and its display text, as the engine sends them. */
const frameColumns = [
  column({ name: "note", role: "value", type: new Utf8() }, text(noteValues), {
    "parallax.index": "0",
    "parallax.title": "note",
  }),
  column({ name: "note#text", role: "text", type: new Utf8() }, text(noteValues), {
    "parallax.index": "0",
  }),
  column({ name: "amount", role: "value", type: new Float64() }, floats([-50, 2.5, 0]), {
    "parallax.index": "1",
    "parallax.title": "amount",
  }),
  column(
    { name: "amount#text", role: "text", type: new Utf8() },
    text(["-50.00", "2.50", "0.00"]),
    {
      "parallax.index": "1",
    },
  ),
];

describe(rangeText, () => {
  test("prefixes a text cell that starts like a formula, and leaves a number's text as it is", () => {
    const frame = decodeFrame(frameMessage(frameColumns, 3));
    expect(rangeText(frame, { bottom: 2, left: 0, right: 1, top: 0 })).toBe(
      "'=1+1\t-50\r\n'@SUM(A1)\t2.5\r\nplain\t0",
    );
  });
});
