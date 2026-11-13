/* `@basis/parallax/internals`: the engine's connection and worker, the frame decoders, the layout's width keys and
 * the theme's readers, which the package's own components are built on. An app takes the components, the hooks, the
 * layout and the themes from `@basis/parallax`; these change without notice in the changelog's sense of an app's
 * surface, and a test or a tool that needs one imports it from here. */

export { BrowserEngine } from "./engine/browser-engine.ts";
export { Connection, type Transport } from "./engine/connection.ts";
export { OpenView } from "./engine/view.ts";
export { ParallaxClient, type ClientOptions, type Restart } from "./engine/client.ts";
export type { LoadRun } from "./engine/holdings.ts";
export type { Unloaded } from "./engine/memory.ts";
export { useParallaxClient } from "./react/context.ts";
export type { ChartWindow, Measurement, ViewListener } from "./engine/view-types.ts";
export { exportTypes, trapReason } from "./engine/limits.ts";
export { decodeFrame } from "./frame/frame.ts";
export { decodeDistinct } from "./frame/distinct.ts";
export { FrameError, decimalFromWords } from "./frame/readers.ts";
export { decodeChartFrame } from "./frame/chart-frame.ts";
export type {
  CandleData,
  ChartContent,
  ChartEventData,
  ChartFrameData,
  ChartTickData,
  HistogramSeries,
  IndicatorLineData,
  SeriesData,
} from "./frame/chart-data.ts";
export { exactDecimal, isNegativeText, pathValue, timestampText } from "./format.ts";
export { layoutSchema, measureOfWidthKey, measureWidthKey, treeWidthKey } from "./layout/layout.ts";
export {
  defaultTheme,
  readChartColors,
  readTheme,
  sameChartColors,
  sameTheme,
} from "./theme/read.ts";
export { installTheme, installTokenStyles, themeStyles, tokenStyles } from "./theme/styles.ts";
