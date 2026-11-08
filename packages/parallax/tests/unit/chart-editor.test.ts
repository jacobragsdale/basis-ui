import { describe, expect, test, vi } from "vite-plus/test";

import { DrawingEditor, measureLines, measureView } from "#chart/drawing-editor.ts";
import { chartModel } from "#chart/model.ts";
import type { ChartModel, Point } from "#chart/model-types.ts";
import type { Measurement } from "#engine/view-types.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { LayoutDrawing } from "#layout/chart.ts";
import { chartColors } from "#theme/charts.ts";

import { chartOf, frameOf, measure, modelOf, tenCandles } from "./chart-pointer-inputs.ts";

const measured: Measurement = {
  change: "4.00",
  fromPosition: 2,
  fromValue: "102.50",
  fromX: "day 2",
  percent: "3.90%",
  rows: 4,
  toPosition: 6,
  toValue: "106.50",
  toX: "day 6",
};

const chart = chartOf({
  kind: "candlestick",
  ohlc: { close: "c", high: "h", low: "l", open: "o" },
  x: "date",
});
const frame: ChartFrameData = frameOf({ candles: tenCandles, kind: "candles" });
const model = modelOf(chart, { frame, width: 500 });

/** An editor over the ten candles, with what it saved, what it was asked to measure and what it said changed. */
interface Editing {
  readonly edit: DrawingEditor;
  readonly saved: (readonly LayoutDrawing[])[];
  readonly asked: (readonly [number, number])[];
  readonly changes: ("state" | "paint")[];
  /** Replaces the host's drawings, as a layout changed elsewhere would. */
  readonly replace: (drawings: readonly LayoutDrawing[]) => void;
}

function editor(start: readonly LayoutDrawing[] = [], editable = true): Editing {
  let drawings = start;
  const saved: (readonly LayoutDrawing[])[] = [];
  const asked: (readonly [number, number])[] = [];
  const changes: ("state" | "paint")[] = [];
  const edit = new DrawingEditor({
    changed: (what): void => {
      changes.push(what);
    },
    drawings: (): readonly LayoutDrawing[] => drawings,
    editable: (): boolean => editable,
    frame: (): ChartFrameData => frame,
    hidden: (): readonly string[] => [],
    measure,
    measureChart: async (from, to): Promise<Measurement> => {
      asked.push([from, to]);
      await Promise.resolve();
      return measured;
    },
    model: (): ChartModel => model,
    save: (next): void => {
      saved.push(next);
      drawings = next;
    },
  });
  return {
    asked,
    changes,
    edit,
    replace: (next): void => {
      drawings = next;
    },
    saved,
  };
}

/** Where a day and a price are on the model. */
function point(day: number, price: number): Point {
  return { x: model.x?.map(day) ?? 0, y: model.yAxes[0]?.scale.map(price) ?? 0 };
}

/** Waits for the engine's answer to reach the editor. */
async function answered(edit: DrawingEditor): Promise<void> {
  await vi.waitFor(() => {
    expect(edit.measuring?.state).toBe("measured");
  });
}

/** An editor that has measured across days 2 to 6. */
async function measuredEditor(): Promise<Editing> {
  const editing = editor();
  editing.edit.pick("measure");
  editing.edit.down(point(2, 102));
  editing.edit.move(point(6, 106));
  editing.edit.up();
  await answered(editing.edit);
  return editing;
}

describe("making drawings", () => {
  test("makes a trend line by pressing, dragging and letting go, then selects it", () => {
    const { edit, saved } = editor();
    edit.pick("trend");
    expect(edit.down(point(1, 101))).toBe(true);
    edit.move(point(5, 105));
    // While dragging, the line is drawn but not saved.
    expect([edit.shown().length, saved]).toStrictEqual([1, []]);
    expect(edit.up()).toBe(true);
    expect(saved).toStrictEqual([
      [{ from: { x: "2026-01-02", y: 101 }, kind: "trend", to: { x: "2026-01-06", y: 105 } }],
    ]);
    expect([edit.state.tool, edit.state.selected]).toStrictEqual([null, 0]);
  });

  test("makes a horizontal line in one press", () => {
    const { edit, saved } = editor();
    edit.pick("horizontal");
    edit.down(point(3, 104));
    expect([saved, edit.state.selected]).toStrictEqual([[[{ kind: "horizontal", y: 104 }]], 0]);
  });

  test("makes nothing from a press without a drag, or below the price's plot", () => {
    const { edit, saved } = editor();
    edit.pick("rectangle");
    edit.down(point(3, 103));
    edit.up();
    expect(saved).toStrictEqual([]);
    // Under the plot, in its axis or a pane, a press is not a drawing.
    expect(edit.down({ x: model.x?.map(3) ?? 0, y: model.plot.y + model.plot.height + 10 })).toBe(
      false,
    );
  });

  test("holds an anchor dragged past the plot at its edge", () => {
    const { edit, saved } = editor();
    edit.pick("rectangle");
    edit.down(point(3, 103));
    edit.move({ x: model.x?.map(6) ?? 0, y: model.plot.y + model.plot.height + 200 });
    edit.up();
    const bottom = model.yAxes[0]?.scale.invert(model.plot.y + model.plot.height) ?? Number.NaN;
    const last = saved.at(-1)?.at(-1);
    expect(last?.kind === "rectangle" ? last.to.y : null).toBeCloseTo(bottom, 1);
  });

  test("anchors a note where pressed, and puts the tool down while its text is typed", () => {
    const { edit, saved } = editor();
    edit.pick("note");
    edit.down(point(2, 102));
    expect([edit.state.note?.anchor.x, edit.state.tool]).toStrictEqual(["2026-01-03", null]);
    // A press elsewhere does not move the note, and a note whose text is dropped is not made.
    edit.down(point(7, 107));
    expect(edit.state.note?.anchor.x).toBe("2026-01-03");
    edit.noteDone(null);
    expect([edit.state.note, saved]).toStrictEqual([null, []]);
  });

  test("places a note once its text is typed", () => {
    const { edit, saved } = editor();
    edit.pick("note");
    edit.down(point(2, 102));
    edit.noteDone("Breakout");
    expect(saved).toStrictEqual([
      [{ at: { x: "2026-01-03", y: 102 }, kind: "note", text: "Breakout" }],
    ]);
  });
});

describe("editing drawings", () => {
  const trend: LayoutDrawing = {
    from: { x: "2026-01-02", y: 101 },
    kind: "trend",
    to: { x: "2026-01-06", y: 105 },
  };

  test("selects a drawing, moves its anchor by its handle, saving once on letting go, and deletes it", () => {
    const { edit, saved } = editor([trend]);
    // A press on the line selects it and is not a pan.
    expect(edit.down(point(3, 103))).toBe(true);
    edit.up();
    expect(edit.down(point(5, 105))).toBe(true);
    edit.move(point(7, 106));
    edit.move(point(8, 107));
    expect(saved).toStrictEqual([]);
    edit.up();
    expect(saved).toStrictEqual([[{ ...trend, to: { x: "2026-01-09", y: 107 } }]]);
    expect([edit.remove(), saved.at(-1), edit.down(point(3, 109))]).toStrictEqual([
      true,
      [],
      false,
    ]);
  });

  test("with the drawing tools off, shows the layout's drawings but neither makes, selects nor deletes one", () => {
    const { edit, saved } = editor([trend], false);
    edit.pick("horizontal");
    // A press with a tool in hand, or on the line, is a pan, not a drawing.
    expect([edit.down(point(3, 104)), edit.up()]).toStrictEqual([false, false]);
    expect([edit.down(point(3, 103)), edit.up()]).toStrictEqual([false, false]);
    expect([edit.remove(), saved, edit.shown()]).toStrictEqual([false, [], [trend]]);
    expect(edit.state.selected).toBeNull();
  });

  test("forgets a selection the layout no longer holds", () => {
    const first: LayoutDrawing = { kind: "horizontal", y: 101 };
    const second: LayoutDrawing = { kind: "horizontal", y: 105 };
    const { edit, saved, replace } = editor([first, second]);
    edit.down(point(3, 105));
    expect(edit.state.selected).toBe(1);
    // The host reorders the drawings: the place now holds another drawing, which Delete must not remove.
    replace([second, first]);
    edit.refresh();
    expect([edit.state.selected, edit.remove(), saved]).toStrictEqual([null, false, []]);
  });

  test("forgets a drag the browser cancelled", () => {
    const { edit, saved } = editor();
    edit.pick("trend");
    edit.down(point(1, 101));
    edit.move(point(5, 105));
    edit.abandon();
    expect([edit.up(), saved]).toStrictEqual([false, []]);
  });

  test("puts the tool down and drops the selection on Escape", () => {
    const { edit } = editor([{ kind: "horizontal", y: 104 }]);
    edit.pick("fibonacci");
    expect([edit.cancel(), edit.state.tool, edit.cancel()]).toStrictEqual([true, null, false]);
  });
});

describe("the editor's state", () => {
  test("keeps its identity while a drawing is stretched, and says only the canvas changed", () => {
    const { edit, changes } = editor();
    edit.pick("trend");
    edit.down(point(1, 101));
    const before = edit.state;
    changes.length = 0;
    edit.move(point(4, 104));
    edit.move(point(5, 105));
    expect([edit.state === before, changes]).toStrictEqual([true, ["paint", "paint"]]);
    edit.up();
    expect([edit.state === before, changes.at(-1)]).toStrictEqual([false, "state"]);
  });
});

describe("measuring", () => {
  test("asks the engine at the snapped places and shows its answer", async () => {
    const { edit, saved, asked } = editor();
    edit.pick("measure");
    edit.down(point(2, 102));
    edit.move(point(6, 106));
    expect(edit.measuring?.state).toBe("dragging");
    edit.up();
    expect(edit.state.measure?.state).toBe("asking");
    await answered(edit);
    expect(edit.measuring).toMatchObject({ measurement: measured, series: "", state: "measured" });
    expect([asked, saved]).toStrictEqual([[[2, 6]], []]);
  });

  test("words the card, and places the band where its days are after a zoom, the card inside the plot", async () => {
    const { edit } = await measuredEditor();
    const zoomed: ChartModel = chartModel({
      categories: null,
      chart,
      colors: chartColors.light,
      frame: { ...frame, xFrom: 4, xTo: 8 },
      height: 300,
      measure,
      muted: "#999999",
      width: 500,
    });
    const { measuring, state } = edit;
    const view = measuring === null ? null : measureView(measuring, zoomed);
    expect(view?.band.x).toBeCloseTo(zoomed.x?.map(2) ?? Number.NaN);
    expect((view?.card.x ?? 0) + 220).toBeLessThanOrEqual(zoomed.plot.x + zoomed.plot.width);
    expect(
      state.measure === null ? [] : measureLines(state.measure).map((line) => line.value),
    ).toStrictEqual(["4.00 (3.90%)", "4", "102.50 → 106.50", "day 2 → day 6"]);
  });

  test("puts a measurement away on the next press", async () => {
    const { edit } = await measuredEditor();
    edit.down(point(8, 108));
    expect([edit.measuring, edit.state.measure]).toStrictEqual([null, null]);
  });

  test("says what it is doing, or that it failed, before the engine's answer", () => {
    const card = { load: 1n, measurement: null, series: "" };
    expect(
      (["dragging", "asking", "nothing", "failed"] as const).map((state) =>
        measureLines({ ...card, state }).map((line) => line.value),
      ),
    ).toStrictEqual([[], ["Measuring…"], ["Nothing to measure here"], ["The measurement failed"]]);
  });
});
