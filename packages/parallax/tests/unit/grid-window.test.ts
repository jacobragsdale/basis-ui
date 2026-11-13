import { Utf8 } from "apache-arrow";
import { describe, expect, test } from "vite-plus/test";

import { decodeFrame } from "#frame/frame.ts";
import type { FrameData } from "#frame/frame.ts";
import { frameToShow } from "#grid/window.ts";

import { column, frameMessage, text } from "./arrow.ts";

const index = { "parallax.index": "0" };
const desks = column({ name: "desk", role: "value", type: new Utf8() }, text(["a", "b"]), index);
const shown = column(
  { name: "desk#text", role: "text", type: new Utf8() },
  text(["a", "b"]),
  index,
);
const decoded = decodeFrame(frameMessage([desks, shown], 2));

/** The frame of configuration version `configVersion`, holding rows `firstRow` on. */
function frame(configVersion: bigint, firstRow: number, changedAtMs?: number): FrameData {
  return {
    ...decoded,
    configVersion,
    firstRow,
    ...(changedAtMs === undefined ? {} : { changedAtMs }),
  };
}

/** A frame of two rows from `firstRow` of a view of a million rows and the one column, too many to hold whole. */
function of(firstRow: number): FrameData {
  return { ...frame(2n, firstRow), totalColumns: 1, totalRows: 1_000_000 };
}

describe(frameToShow, () => {
  test("shows a frame of a newer layout", () => {
    const newer = frame(2n, 0, 10);
    expect(frameToShow(frame(1n, 0), newer, null)).toBe(newer);
  });

  test("keeps when a change was asked for on a later frame of its layout that replaces its first before it draws", () => {
    const first = frame(2n, 0, 10);
    const later = frame(2n, 0);
    expect(frameToShow(first, later, null)).toStrictEqual({ ...later, changedAtMs: 10 });
  });

  test("lets a frame of a newer change keep its own time", () => {
    expect(frameToShow(frame(2n, 0, 10), frame(3n, 0, 20), null).changedAtMs).toBe(20);
  });

  /** The window in view: the first two rows of the one column. */
  const inView = { columnCount: 1, firstColumn: 0, firstRow: 0, rowCount: 2 };

  test("keeps the frame shown when a late answer of its layout lacks the rows in view that it holds", () => {
    const shownNow = of(0);
    // Rows 100 on, asked for before the user scrolled back to the top.
    expect(frameToShow(shownNow, of(100), inView)).toBe(shownNow);
  });

  test("takes a late answer that holds the rows in view", () => {
    const arriving = of(0);
    expect(frameToShow(of(100), arriving, inView)).toBe(arriving);
  });

  test("takes an answer of another table load, late or not", () => {
    const reloaded = { ...of(100), loadVersion: decoded.loadVersion + 1n };
    expect(frameToShow(of(0), reloaded, inView)).toBe(reloaded);
  });
});
