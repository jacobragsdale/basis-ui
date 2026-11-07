/* What a grid offers besides what it shows: its ref's methods, measuring, exporting and listing a column's values, and
 * Ctrl+F's search. */

import { useImperativeHandle, useLayoutEffect } from "react";
import type { Ref, RefObject } from "react";

import type { ExportFormat } from "#engine/messages.ts";
import type { DistinctValues } from "#engine/view-types.ts";
import { useParallaxClient } from "#react/context.ts";

import { exportView } from "./export.ts";
import type { GridState } from "./grid.tsx";
import type { DrawStats } from "./paint/stats.ts";

/** What a grid's ref offers: measuring, exporting, and the values of a column for a filter pick-list. */
interface GridHandle {
  /** Drawing counters, for measuring the grid. */
  readonly drawStats: () => DrawStats;
  /** Downloads what the grid shows as an Excel workbook or a CSV file. */
  readonly export: (format: ExportFormat) => void;
  /** Lists a column's values under the view's other filters. */
  readonly distinctValues: (
    column: string,
    search: string,
    limit: number,
  ) => Promise<DistinctValues>;
}

/** Gives the grid's ref its methods, and Ctrl+F the toolbar's search. */
function useHandles(
  state: GridState,
  {
    ref,
    searchBox,
  }: {
    readonly ref: Ref<GridHandle> | undefined;
    readonly searchBox: RefObject<HTMLInputElement | null>;
  },
): (format: ExportFormat) => void {
  const { controller, view, snapshot } = state;
  const client = useParallaxClient();
  const exportAs = (format: ExportFormat): void => {
    if (view.layout !== null) {
      const say = (message: string): void => {
        controller.say(message);
      };
      exportView(client, { format, layout: view.layout, shown: snapshot.loadVersion }, say).catch(
        reportError,
      );
    }
  };
  useImperativeHandle(ref, () => ({
    distinctValues: async (
      column: string,
      search: string,
      limit: number,
    ): Promise<DistinctValues> => {
      if (view.handle === null) {
        throw new Error("the view is not open yet");
      }
      return view.handle.distinctValues(column, search, limit);
    },
    drawStats: (): DrawStats => controller.drawStats,
    export: exportAs,
  }));
  useLayoutEffect(() => {
    controller.setSearch(() => {
      searchBox.current?.focus();
      searchBox.current?.select();
      return searchBox.current !== null;
    });
  }, [controller, searchBox]);
  return exportAs;
}

export { useHandles };
export type { GridHandle };
