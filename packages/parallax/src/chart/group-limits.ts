/* How many groups and series a bar chart, heatmap, pie or waterfall draws. It reads every group of its grouped view up
 * to the most it draws, and past them says so in place of the plot, with what to change, rather than draw some. */

import type { Viewport } from "#engine/view-types.ts";
import type { FrameData } from "#frame/frame.ts";

import type { CategoryData } from "./category-data.ts";

/** The most groups a grouped chart draws, and the most series. */
const maxGroups = 2000;
const maxColumns = 400;

/** The window of a grouped view a chart reads: the grand total's row, every group up to the most it draws, and their
 * columns. */
const groupsViewport: Viewport = {
  columnCount: maxColumns,
  firstColumn: 0,
  firstRow: 0,
  rowCount: maxGroups + 1,
};

/** What a grouped frame holds past what a chart draws: rows it did not read, or more groups than it draws, or more
 * columns; nothing when it holds no more. */
function unreadOf(frame: FrameData, groups: number): Pick<CategoryData, "unread"> {
  if (frame.firstRow + frame.rowCount < frame.totalRows || groups > maxGroups) {
    return { unread: "groups" };
  }
  return frame.firstColumn + frame.columns.length < frame.totalColumns ? { unread: "series" } : {};
}

const count = new Intl.NumberFormat("en-US");

/** Why a chart of `kind` does not draw its grouped view, and what to change, or null when it draws all of it. */
function unreadProblem(kind: string, unread: CategoryData["unread"]): string | null {
  switch (unread) {
    case "groups": {
      return `A ${kind} chart draws at most ${count.format(maxGroups)} groups, and this one has more: filter its rows, group it by a coarser column, or keep the largest with top_n`;
    }
    case "series": {
      return `A ${kind} chart draws at most ${count.format(maxColumns)} series, and this one has more: filter its rows, or split it by a column with fewer values`;
    }
    case undefined: {
      return null;
    }
    default: {
      return unread satisfies never;
    }
  }
}

export { groupsViewport, maxGroups, unreadOf, unreadProblem };
