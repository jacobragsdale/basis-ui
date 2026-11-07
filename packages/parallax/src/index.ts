/* `@basis/parallax`'s entry point: the React layer first, then the framework-free core it is built on. The engine's
 * worker is the package's other entry, `@basis/parallax/worker`. */

// The React layer.
export { ParallaxProvider, type ParallaxProviderProps } from "./react/provider.tsx";
export { useParallaxClient, type ParallaxThemeState } from "./react/context.ts";
export {
  useDataset,
  type Dataset,
  type DatasetSource,
  type DatasetStatus,
} from "./react/use-dataset.ts";
export { useView, type View, type ViewOptions } from "./react/use-view.ts";
export type { ViewState, ViewStatus } from "./react/view-state.ts";
export {
  useParallaxTheme,
  type ParallaxThemeAttributes,
  type ParallaxThemeInfo,
  type ParallaxTokens,
} from "./react/use-theme.ts";

// The engine, its worker and its protocol.
export {
  ParallaxClient,
  type ClientOptions,
  type Restart,
  type WorkerSource,
} from "./engine/client.ts";
export { BrowserEngine } from "./engine/browser-engine.ts";
export type { WorkerPort } from "./engine/port.ts";
export { Connection, type Transport } from "./engine/connection.ts";
export { ViewHandle } from "./engine/view.ts";
export type {
  ChartWindow,
  DistinctValues,
  Measurement,
  ViewListener,
  Viewport,
} from "./engine/view-types.ts";
export {
  exportTypes,
  maxArrowBytes,
  maxRows,
  maxXlsxCells,
  trapReason,
  type LoadOptions,
  type Loaded,
} from "./engine/limits.ts";
export type { ExportFormat } from "./engine/messages.ts";

// Frames.
export { decodeFrame, type FrameData, type GroupKey } from "./frame/frame.ts";
export type { FrameColumn } from "./frame/columns.ts";
export type { RowKind, TreeRows } from "./frame/tree.ts";
export type { CellFlag, CellValue } from "./frame/cell.ts";
export { decodeDistinct, type DistinctValue } from "./frame/distinct.ts";
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

// Layouts.
export {
  aggregates,
  checkLayout,
  filterOps,
  layoutSchema,
  layoutVersion,
  measureOfWidthKey,
  measureWidthKey,
  parseLayout,
  showAs,
  textFilterOps,
  treeWidthKey,
  type FilterOp,
  type Layout,
  type LayoutCheck,
  type LayoutFilter,
  type LayoutFormat,
  type LayoutInput,
  type LayoutMeasure,
  type LayoutScalar,
} from "./layout/layout.ts";
export {
  chartKinds,
  drawableKinds,
  drawingKinds,
  indicatorKinds,
  maxNote,
  type LayoutAnchor,
  type LayoutChart,
  type LayoutDrawing,
  type LayoutIndicator,
} from "./layout/chart.ts";
export { decodeLayout, encodeLayout } from "./layout/share.ts";

// Theming.
export { basisTheme } from "./theme/basis.ts";
export {
  airyTheme,
  defineTheme,
  standardTheme,
  token,
  type ParallaxTheme,
  type ThemeParams,
  type ThemeSpec,
} from "./theme/define.ts";
export { chartColors, type ChartColors } from "./theme/charts.ts";
export {
  defaultTheme,
  readChartColors,
  readTheme,
  sameChartColors,
  sameTheme,
  type Theme,
} from "./theme/read.ts";
export {
  densityStep,
  installTheme,
  installTokenStyles,
  themeStyles,
  tokenProperties,
  tokenStyles,
} from "./theme/styles.ts";
export type { ResolvedScheme, Scheme } from "./theme/kinds.ts";
export type { TokenName } from "./theme/tokens.ts";
