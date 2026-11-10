/* The tools' arithmetic and text: the performance overlay's figures and report, and the theme studio's CSS and
 * TypeScript. */

import type { DrawStats } from "@basis/parallax";
import { describe, expect, test } from "vite-plus/test";

import { drawTime, figureLines, inputToScreen, percentile, report } from "./performance-figures.ts";
import { settingsCss, settingsTypescript, withSetting } from "./studio-settings.ts";

const stats = (frames: number, drawMs: number): DrawStats => ({
  cellDraws: 0,
  changes: [],
  copies: 0,
  drawMs,
  firstRows: null,
  frames,
  fullDraws: 0,
  latencyMs: [],
  paintedPx: 0,
});

describe("the performance overlay's figures", () => {
  test("percentiles interpolate between the nearest ranks, and are 0 of nothing", () => {
    expect(percentile([4, 1, 3, 2], 50)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(48);
    expect(percentile([], 50)).toBe(0);
  });

  test("a change is timed from the latest input in the second before it was sent", () => {
    const changes = [
      { drawnAtMs: 1100, sentAtMs: 1050 },
      { drawnAtMs: 5000, sentAtMs: 4900 },
    ];
    expect(inputToScreen(changes, [100, 900, 1000, 1200])).toStrictEqual([100]);
  });

  test("drawing time per frame is over the frames since the last sample, kept while idle", () => {
    expect(drawTime(stats(30, 90), stats(10, 30), null)).toBe(3);
    expect(drawTime(stats(10, 30), stats(10, 30), 3)).toBe(3);
    // A new grid's counters start again, and so does its figure.
    expect(drawTime(stats(2, 4), stats(10, 30), 3)).toBeNull();
  });

  test("the report names the machine and lists every figure", () => {
    const lines = figureLines(
      { blockedMsPerSecond: 0, frameP50: 16.7, frameP95: 16.8, grids: [], longFrames: 0 },
      { bytes: 104_857_600, scope: "whole tab, workers included" },
    );
    const text = report(lines, {
      browser: "Chromium",
      isolated: true,
      page: "http://127.0.0.1/",
      processors: 4,
      showing: "Charts, no grids, light mode, comfortable density",
      taken: "2026-11-07T12:00:00.000Z",
      window: "1400 x 900 at 1x",
    });
    expect(text.split("\n")).toStrictEqual([
      "parallax performance report",
      "Taken: 2026-11-07T12:00:00.000Z",
      "Page: http://127.0.0.1/",
      "Showing: Charts, no grids, light mode, comfortable density",
      "Browser: Chromium",
      "Logical processors: 4",
      "Window: 1400 x 900 at 1x",
      "Cross-origin isolated: yes",
      "Frame time: 16.7 ms median, 16.8 ms p95",
      "Long frames: 0 in 10 s, 0.0 ms blocked per s",
      "Grid drawing: n/a per frame",
      "First rows: n/a",
      "Input to screen: n/a",
      "Draws: n/a",
      "Rows asked to drawn: n/a",
      "Memory: 100 MB",
      "Memory covers: whole tab, workers included",
    ]);
  });
});

describe("the theme studio's output", () => {
  test("a setting replaces the property's value, and an empty one removes it", () => {
    const settings = withSetting({ "--px-accent": "#000000" }, "--px-radius", "8px");
    expect(withSetting(settings, "--px-accent", "")).toStrictEqual({ "--px-radius": "8px" });
  });

  test("copies as CSS for :root, or says to move a control first", () => {
    expect(settingsCss({})).toBe("/* Move a control to make a theme. */");
    expect(settingsCss({ "--px-accent": "#7c3aed", "--px-radius": "8px" })).toBe(
      ":root {\n  --px-accent: #7c3aed;\n  --px-radius: 8px;\n}",
    );
  });

  test("copies as a theme over @basis/ui's, lengths in pixels as numbers", () => {
    expect(settingsTypescript({ "--px-accent": "#7c3aed", "--px-radius": "8px" })).toBe(
      [
        'import { basisTheme, defineTheme } from "@basis/parallax";',
        "",
        "export const myTheme = defineTheme({",
        "  extends: basisTheme,",
        '  name: "mine",',
        "  params: {",
        '    accent: "#7c3aed",',
        "    radius: 8,",
        "  },",
        "});",
      ].join("\n"),
    );
  });
});
