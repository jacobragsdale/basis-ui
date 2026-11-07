/* A header menu's fields for its column: its title, which an empty title gives back, and its total. */

import { Input, NativeSelect, NativeSelectOption } from "@basis/ui";
import { useId } from "react";
import type { ReactNode } from "react";

import type { Layout } from "#layout/layout.ts";

import { totalChoices, totalOf, withTitle, withTotal } from "./edit.ts";
import type { FieldKind } from "./fields.ts";
import { aggregateLabel } from "./labels.ts";

/** What a part of the menu edits: the layout and the column, and how a choice is made. */
interface MenuPart {
  readonly layout: Layout;
  readonly column: string;
  readonly kind: FieldKind;
  readonly onChange: (layout: Layout) => void;
}

/** The column's title, which an empty title gives back. */
function TitleField({ layout, column, onChange }: MenuPart): ReactNode {
  const id = useId();
  const title = layout.titles[column] ?? column;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-10">
        Title
      </label>
      <Input
        id={id}
        key={title}
        defaultValue={title}
        onBlur={(event) => {
          onChange(withTitle(layout, column, event.currentTarget.value));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onChange(withTitle(layout, column, event.currentTarget.value));
          }
        }}
      />
    </div>
  );
}

/** The column's total, by the aggregates its kind takes. */
function TotalField({ layout, column, kind, onChange }: MenuPart): ReactNode {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-10">
        Total
      </label>
      <NativeSelect
        id={id}
        className="flex-1"
        value={totalOf(layout, column) ?? ""}
        onChange={(event) => {
          const { value } = event.currentTarget;
          onChange(
            withTotal(
              layout,
              column,
              totalChoices(kind).find((choice) => choice === value) ?? null,
            ),
          );
        }}
      >
        <NativeSelectOption value="">None</NativeSelectOption>
        {totalChoices(kind).map((choice) => (
          <NativeSelectOption key={choice} value={choice}>
            {aggregateLabel(choice)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

export { TitleField, TotalField };
export type { MenuPart };
