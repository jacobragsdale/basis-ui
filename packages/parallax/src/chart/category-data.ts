/* A grouped view's groups as the charts that draw them read them: bar charts, heatmaps, pies and waterfalls. */

import type { LayoutScalar } from "#layout/layout.ts";

/** One series of a bar chart, heatmap, pie or waterfall, by group. */
interface CategorySeries {
  readonly label: string;
  readonly values: readonly number[];
  readonly texts: readonly string[];
  /** The grand total's text, if the view has one. */
  readonly total: string | null;
  /** The grand total's value for drawing, if the view has one, such as a waterfall's total bar. */
  readonly totalValue?: number;
}

/** Data of a bar chart, heatmap, pie or waterfall, taken from the layout's grouped view. */
interface CategoryData {
  readonly categories: readonly string[];
  /** Each group's key, as exact JSON, which selecting it reports. */
  readonly keys: readonly LayoutScalar[];
  /** Which groups are the top-N's "Other", which stands for several and can't be selected. */
  readonly others: readonly boolean[];
  readonly series: readonly CategorySeries[];
  /** What the view holds past what a chart draws, which it then refuses to draw rather than draw part of: more
   * groups, or more series; null when it read them all. */
  readonly unread?: "groups" | "series";
}

export type { CategoryData, CategorySeries };
