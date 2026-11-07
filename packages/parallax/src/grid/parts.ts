/* Which parts of a grid's toolbar show. */

/** Which parts of the toolbar show. A grid in a small tile can turn some, or the whole toolbar, off. */
interface ToolbarParts {
  readonly search: boolean;
  readonly chips: boolean;
  /** The column chooser; a pivot, whose columns are its measures, has none. */
  readonly columns: boolean;
  /** The totals row's switch; a pivot has its grand total instead. */
  readonly totals: boolean;
  readonly export: boolean;
  /** The strip above the grid where its groups show, and headers are dropped to group by them. */
  readonly group: boolean;
  /** Expand all and Collapse all, for a pivot's groups; a grid's groups have them in the group panel. */
  readonly expand: boolean;
}

/** Every part shown. */
const allParts: ToolbarParts = {
  chips: true,
  columns: true,
  expand: true,
  export: true,
  group: true,
  search: true,
  totals: true,
};

export { allParts };
export type { ToolbarParts };
