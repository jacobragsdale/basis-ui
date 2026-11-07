/* The pivot's settings, as Excel's PivotTable field list lays them out: the searchable fields, then the Filters,
 * Columns, Rows and Values areas they are dragged into, then the options. The panel keeps what is being dragged and
 * turns each drop into a layout, and says what a move by the keyboard did. */

import { useState } from "react";
import type { ReactNode } from "react";

import type { SourceField } from "#grid/fields.ts";
import type { ValueSource } from "#grid/value-picker.tsx";
import type { Layout } from "#layout/layout.ts";

import type { Dragged } from "./drag-list.tsx";
import { chipColumn, moveChip, placeField, removeChip } from "./edit.ts";
import type { Target } from "./edit.ts";
import { FieldList } from "./field-list.tsx";
import { FilterWell } from "./filter-well.tsx";
import type { ChipArea } from "./labels.ts";
import { Options } from "./options.tsx";
import { useFilterChips } from "./use-filter-chips.ts";
import { Well } from "./well.tsx";

/** The areas with chips, in Excel's order below Filters. */
const wells: readonly ChipArea[] = ["columns", "rows", "values"];

interface PivotPanelProps {
  readonly id: string;
  /** The layout being edited. */
  readonly layout: Layout;
  /** The dataset's columns. */
  readonly fields: readonly SourceField[];
  /** Where filter pick-lists' values come from. */
  readonly source: ValueSource;
  readonly onChange: (layout: Layout) => void;
}

/** The layout once what is dragged lands in an area, or null when nothing the panel knows was dragged. */
function dropped(
  { layout, fields }: Pick<PivotPanelProps, "layout" | "fields">,
  dragged: Dragged | null,
  to: Target,
): Layout | null {
  if (dragged?.kind === "chip") {
    return moveChip(layout, { from: dragged.chip, to }, fields);
  }
  const field = fields.find((entry) => entry.name === dragged?.column);
  return field === undefined ? null : placeField(layout, field, to);
}

/** The column a drop on Filters filters by, and the layout without the chip dropped, which moves there as in Excel. */
function droppedOnFilters(
  layout: Layout,
  dragged: Dragged | null,
): { readonly column: string; readonly layout: Layout } | null {
  if (dragged?.kind === "field") {
    return { column: dragged.column, layout };
  }
  const column = dragged === null ? null : chipColumn(layout, dragged.chip);
  return dragged === null || column === null
    ? null
    : { column, layout: removeChip(layout, dragged.chip) };
}

/** The areas: Filters, then Columns, Rows and Values. */
function Areas(props: PivotPanelProps & { readonly onSay: (text: string) => void }): ReactNode {
  const { layout, fields, source, onChange, onSay } = props;
  const [dragging, setDragging] = useState<Dragged | null>(null);
  const chips = useFilterChips();
  const { filterBy } = chips;
  const land = (next: Layout | null): void => {
    setDragging(null);
    if (next !== null) {
      onChange(next);
    }
  };
  return (
    <>
      <FieldList
        layout={layout}
        fields={fields}
        onChange={onChange}
        onDrag={setDragging}
        onFilter={filterBy}
      />
      <p className="text-xs text-muted-foreground">
        Drag fields between the areas below, or use their menus.
      </p>
      <FilterWell
        {...{ chips, dragging, fields, layout, onChange, source }}
        onDrop={() => {
          const next = droppedOnFilters(layout, dragging);
          land(next?.layout ?? null);
          if (next !== null) {
            filterBy(next.column);
          }
        }}
      />
      {wells.map((area) => (
        <Well
          key={area}
          {...{ area, dragging, fields, layout, onChange, onSay }}
          onDrag={setDragging}
          onFilter={filterBy}
          onDrop={(to) => {
            land(dropped(props, dragging, to));
          }}
        />
      ))}
    </>
  );
}

/** The pivot's settings. */
function PivotPanel(props: PivotPanelProps): ReactNode {
  const { id, layout, onChange } = props;
  const [said, setSaid] = useState("");
  return (
    <div id={id} className="flex min-h-0 flex-col gap-3 overflow-auto px-2.5 pb-2.5">
      <Areas {...props} onSay={setSaid} />
      <Options layout={layout} onChange={onChange} />
      <output className="sr-only">{said}</output>
    </div>
  );
}

export { PivotPanel };
