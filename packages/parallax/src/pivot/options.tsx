/* The pivot's options: how many levels of groups open by default, and top-N, which keeps only the largest groups by a
 * value and puts the rest in Other. They sit at the foot of the narrow settings panel, so each control has a line of
 * its own; the value top-N ranks by reads as "by Sum of pnl" in its select. */

import { Checkbox, Label, NativeSelect, NativeSelectOption } from "@basis/ui";
import { useId } from "react";
import type { ReactNode } from "react";

import { measureName } from "#grid/labels.ts";
import type { Layout } from "#layout/layout.ts";

import { setExpandDepth, setTopN, topN } from "./edit.ts";
import { NumberInput } from "./number-input.tsx";

/** How many groups top-N keeps when it is turned on. */
const defaultTop = 10;

interface OptionsProps {
  readonly layout: Layout;
  readonly onChange: (layout: Layout) => void;
}

/** How many levels of groups open by default. */
function OpenLevels({ layout, onChange }: OptionsProps): ReactNode {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id}>Open levels</Label>
      <NumberInput
        id={id}
        min={0}
        max={layout.group_by.length}
        className="w-20"
        value={layout.expand_depth}
        onCommit={(depth) => {
          onChange(setExpandDepth(layout, depth));
        }}
      />
    </div>
  );
}

/** How many groups top-N keeps. */
function TopCount({ layout, onChange }: OptionsProps): ReactNode {
  const top = layout.top_n;
  return (
    <NumberInput
      min={1}
      aria-label="How many groups"
      className="w-20"
      disabled={top === null}
      value={top?.n ?? defaultTop}
      onCommit={(count) => {
        if (top !== null) {
          const counted = topN(count, top.measure);
          onChange(setTopN(layout, { ...counted, largest: top.largest, other: top.other }));
        }
      }}
    />
  );
}

/** The value top-N ranks the groups by. */
function TopMeasure({ layout, onChange }: OptionsProps): ReactNode {
  const top = layout.top_n;
  // The layout names a measure by its place.
  const choices = layout.measures.map((entry, index) => ({
    text: `by ${measureName(entry)}`,
    value: String(index),
  }));
  return (
    <NativeSelect
      size="sm"
      aria-label="Top-N measure"
      className="w-full"
      value={String(top?.measure ?? 0)}
      disabled={top === null}
      onChange={(event) => {
        const by = Number(event.currentTarget.value);
        if (top !== null && Number.isInteger(by)) {
          onChange(setTopN(layout, { ...top, measure: by }));
        }
      }}
    >
      {choices.map((choice) => (
        <NativeSelectOption key={choice.value} value={choice.value}>
          {choice.text}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Top-N: on or off, how many groups, and by which value. */
function TopN({ layout, onChange }: OptionsProps): ReactNode {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <Label>
          <Checkbox
            checked={layout.top_n !== null}
            disabled={layout.measures.length === 0}
            onCheckedChange={(checked) => {
              onChange(setTopN(layout, checked ? topN(defaultTop, 0) : null));
            }}
          />
          Top
        </Label>
        <TopCount layout={layout} onChange={onChange} />
      </div>
      <TopMeasure layout={layout} onChange={onChange} />
    </>
  );
}

/** The options. */
function Options({ layout, onChange }: OptionsProps): ReactNode {
  return (
    <section aria-label="Options" className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Options</h3>
      <OpenLevels layout={layout} onChange={onChange} />
      <TopN layout={layout} onChange={onChange} />
    </section>
  );
}

export { Options };
