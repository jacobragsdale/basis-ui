/* One value of a pivot, as a menu: how it is computed (aggregate, column, weight or percentile), shown (show as and its
 * number format) and placed (move, remove). A measure's header adds sorting the groups by it. The field list's Values
 * chips and the pivot's headers share it, so a value reads the same wherever it is edited. */

import { Separator } from "@basis/ui";
import type { ReactNode } from "react";

import type { MeasureMenuProps } from "#grid/grid-menu.tsx";
import { Menu, MenuItem } from "#grid/header-menu.tsx";
import type { Layout } from "#layout/layout.ts";

import { ComputeFields, ShowFields } from "./measure-fields.tsx";
import type { MeasurePart } from "./measure-fields.tsx";
import {
  measure as plainMeasure,
  measureSort,
  moveMeasure,
  removeMeasure,
  withMeasureSort,
} from "./measures.ts";

interface PivotMeasureMenuProps extends MeasureMenuProps {
  /** Whether to offer sorting the groups by the measure, as its header does. */
  readonly sorting: boolean;
}

/** A part of the menu whose choices end its work. */
interface FinishingPart extends MeasurePart {
  readonly finish: (layout: Layout) => void;
}

/** Sorting the pivot's groups by the measure, either way, or not. */
function SortItems({ layout, index, finish }: FinishingPart): ReactNode {
  return (
    <Menu label="Sort">
      <MenuItem
        onClick={() => {
          finish(withMeasureSort(layout, index, true));
        }}
      >
        Sort largest first
      </MenuItem>
      <MenuItem
        onClick={() => {
          finish(withMeasureSort(layout, index, false));
        }}
      >
        Sort smallest first
      </MenuItem>
      <MenuItem
        disabled={measureSort(layout, index) === null}
        onClick={() => {
          finish(withMeasureSort(layout, index, null));
        }}
      >
        Clear sort
      </MenuItem>
    </Menu>
  );
}

/** Moving the measure among the others, or removing it. A header's menu says left and right, as the columns lie. */
function PlaceItems({
  layout,
  index,
  finish,
  sorting,
}: FinishingPart & { readonly sorting: boolean }): ReactNode {
  return (
    <Menu label="Place">
      <MenuItem
        disabled={index === 0}
        onClick={() => {
          finish(moveMeasure(layout, index, -1));
        }}
      >
        {sorting ? "Move left" : "Move up"}
      </MenuItem>
      <MenuItem
        disabled={index === layout.measures.length - 1}
        onClick={() => {
          finish(moveMeasure(layout, index, 1));
        }}
      >
        {sorting ? "Move right" : "Move down"}
      </MenuItem>
      <MenuItem
        onClick={() => {
          finish(removeMeasure(layout, index));
        }}
      >
        Remove value
      </MenuItem>
    </Menu>
  );
}

/** A pivot value's menu. */
function MeasureMenu({
  layout,
  measure: index,
  fields,
  onChange,
  onDone,
  sorting,
}: PivotMeasureMenuProps): ReactNode {
  const part: FinishingPart = {
    current: layout.measures[index] ?? plainMeasure("count_all", null),
    fields,
    finish: (next) => {
      onChange(next);
      onDone();
    },
    index,
    layout,
    onChange,
  };
  return (
    <div data-slot="pivot-measure-menu" className="flex flex-col gap-1.5 text-sm">
      {sorting ? (
        <>
          <SortItems {...part} />
          <Separator />
        </>
      ) : null}
      <ComputeFields {...part} />
      <ShowFields {...part} />
      <Separator />
      <PlaceItems {...part} sorting={sorting} />
    </div>
  );
}

/** The menu a pivot's measure header opens, which the pivot gives its grid. */
function HeaderMeasureMenu(props: MeasureMenuProps): ReactNode {
  return <MeasureMenu {...props} sorting />;
}

export { HeaderMeasureMenu, MeasureMenu };
