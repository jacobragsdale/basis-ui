import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { clock, emptyFrame, open, rows, summary } from "./channel.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a view's updates", () => {
  test("go one at a time, and only the newest of those asked for meanwhile", () => {
    const { view, sent } = open();
    view.update("a", () => rows(0));
    view.update("b", () => rows(0));
    view.update("c", () => rows(0));
    expect(summary(sent)).toStrictEqual([["update", "a", 1n, 0]]);
    // The answer to "a" lets "c" go.
    view.receiveFrame(emptyFrame(1n), 3n);
    expect(summary(sent)).toStrictEqual([
      ["update", "a", 1n, 0],
      ["update", "c", 2n, 0],
    ]);
  });

  test("draw only the newest layout's frames, timed from when it was asked for", () => {
    const time = clock(3000);
    const { view, frames } = open();
    view.update("a", () => rows(0));
    time.set(3020);
    view.update("c", () => rows(0));
    // The answer to "a" is not drawn, as a newer layout is on its way.
    view.receiveFrame(emptyFrame(1n), 3n);
    view.receiveFrame(emptyFrame(2n), 4n);
    expect(frames.map((frame) => [frame.configVersion, frame.changedAtMs])).toStrictEqual([
      [2n, 3020],
    ]);
  });

  test("hold what is asked for meanwhile, which follows the update", () => {
    const { view, sent } = open();
    view.update("a", () => rows(0));
    view.update("b", () => rows(300));
    // Waiting behind "b", so that they apply to its layout.
    view.setViewport(rows(200));
    view.setExpanded(["Atlas"], true);
    view.setChartWindow({ height: 100, width: 300 });
    expect(summary(sent)).toStrictEqual([["update", "a", 1n, 0]]);
    view.receiveFrame(emptyFrame(1n), 3n);
    // The window is read when "b" goes, so it is the newest, and the viewport waiting is dropped.
    expect(summary(sent)).toStrictEqual([
      ["update", "a", 1n, 0],
      ["update", "b", 2n, 300],
      ["expand", '["Atlas"]', true],
      ["chart", 300],
    ]);
  });

  test("carry the window, which counts as asked for", () => {
    const { view, sent } = open();
    view.update("a", () => rows(300));
    expect(view.requested()).toStrictEqual(rows(300));
    // The same window again is already asked for.
    view.setViewport(rows(300));
    expect(summary(sent)).toStrictEqual([["update", "a", 1n, 300]]);
  });

  test("let the next one go when the engine refuses one", () => {
    const { view, sent, errors } = open();
    view.update("bad", () => rows(0));
    view.update("good", () => rows(0));
    view.receiveError("no such column", 3n);
    expect(errors).toStrictEqual(["no such column"]);
    expect(summary(sent)).toStrictEqual([
      ["update", "bad", 1n, 0],
      ["update", "good", 2n, 0],
    ]);
  });

  test("without a window go at once, as the engine may have nothing to answer them with", () => {
    const { view, sent } = open("prices");
    // A chart not yet asked for a window: neither update is answered, and neither waits.
    view.update("a");
    view.update("b");
    view.setChartWindow({ height: 100, width: 300 });
    // A window the caller cannot give yet is no window.
    view.update("c", () => null);
    view.setExpanded(["Atlas"], true);
    expect(summary(sent)).toStrictEqual([
      ["update", "a", 1n, null],
      ["update", "b", 2n, null],
      ["chart", 300],
      ["update", "c", 3n, null],
      ["expand", '["Atlas"]', true],
    ]);
  });

  test("hold viewports until their window is answered, but not expansions while none waits", () => {
    const { view, sent } = open();
    view.update("a", () => rows(0));
    view.setViewport(rows(100));
    view.setExpanded(["Atlas"], false);
    expect(summary(sent)).toStrictEqual([
      ["update", "a", 1n, 0],
      ["expand", '["Atlas"]', false],
    ]);
    view.receiveFrame(emptyFrame(1n), 3n);
    expect(summary(sent).at(-1)).toStrictEqual(["viewport", 100]);
  });

  test("remember the newest layout given, sent or waiting", () => {
    const { view } = open();
    expect(view.layoutJson).toBe("{}");
    view.update("a", () => rows(0));
    view.update("b", () => rows(0));
    expect([view.layoutJson, view.layoutAt(1n)]).toStrictEqual(["b", "a"]);
  });
});
