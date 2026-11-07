/* The fields of a pivot value's menu: how it is computed, by an aggregate of a column with a weight or a percentile,
 * and how it is shown, as a value or a share and in a number format. Each change goes out at once. */

import type { ReactNode } from "react";

import type { SourceField } from "#grid/fields.ts";
import { aggregates, showAs } from "#layout/layout.ts";
import type { Layout, LayoutFormat, LayoutMeasure } from "#layout/layout.ts";

import { choices, fieldChoices, isNumeric, numericAggregates } from "./labels.ts";
import type { Choice } from "./labels.ts";
import { defaultPercentile, updateMeasure, withMeasureFormat } from "./measures.ts";
import { NumberSetting, SelectSetting } from "./setting.tsx";

/** Decimal places a value can show; Auto keeps the column's own. */
const decimals: readonly Choice[] = [
  { text: "Auto", value: "" },
  ...["0", "1", "2", "3", "4", "6"].map((places) => ({ text: places, value: places })),
];

const abbreviations: readonly Choice[] = [
  { text: "None", value: "" },
  { text: "Thousands (K)", value: "thousands" },
  { text: "Millions (M)", value: "millions" },
  { text: "Billions (B)", value: "billions" },
];

const negatives: readonly Choice[] = [
  { text: "-1,234", value: "minus" },
  { text: "(1,234)", value: "parentheses" },
];

const aggregateChoices = choices(aggregates);
const showAsChoices = choices(showAs);
/** A percentile is typed in hundredths. */
const percentScale = 100;

/** What a menu's fields edit: the layout, the measure's index and the measure, the dataset's columns, and where a
 * change goes. */
interface MeasurePart {
  readonly layout: Layout;
  readonly index: number;
  readonly current: LayoutMeasure;
  readonly fields: readonly SourceField[];
  readonly onChange: (layout: Layout) => void;
}

/** The columns an aggregate takes: numbers for a sum or a mean, any column for a count. */
function columnsFor(
  aggregate: LayoutMeasure["aggregate"],
  fields: readonly SourceField[],
): readonly SourceField[] {
  return numericAggregates.has(aggregate) ? fields.filter((field) => isNumeric(field)) : fields;
}

/** The measure's fields after its aggregate changes: a column that aggregate takes, and its percentile or weight. */
function withAggregate(part: MeasurePart, value: string): Partial<LayoutMeasure> | null {
  const aggregate = aggregates.find((entry) => entry === value);
  if (aggregate === undefined) {
    return null;
  }
  const { current, fields } = part;
  const allowed = columnsFor(aggregate, fields);
  const kept = allowed.some((field) => field.name === current.column);
  const column = kept ? current.column : (allowed[0]?.name ?? null);
  return {
    aggregate,
    column: aggregate === "count_all" ? null : column,
    percentile: aggregate === "percentile" ? (current.percentile ?? defaultPercentile) : null,
    weight: aggregate === "weighted_mean" ? current.weight : null,
  };
}

/** The column, weight or percentile the measure's aggregate takes. */
function AggregateInputs(part: MeasurePart): ReactNode {
  const { layout, index, current, fields, onChange } = part;
  const patch = (next: Partial<LayoutMeasure>): void => {
    onChange(updateMeasure(layout, index, next));
  };
  return (
    <>
      {current.aggregate === "count_all" ? null : (
        <SelectSetting
          label="Column"
          choices={fieldChoices(columnsFor(current.aggregate, fields))}
          value={current.column ?? ""}
          onPick={(column) => {
            patch({ column });
          }}
        />
      )}
      {current.aggregate === "weighted_mean" ? (
        <SelectSetting
          label="Weight"
          choices={[{ text: "weight…", value: "" }, ...fieldChoices(columnsFor("sum", fields))]}
          value={current.weight ?? ""}
          onPick={(weight) => {
            patch({ weight: weight === "" ? null : weight });
          }}
        />
      ) : null}
      {current.aggregate === "percentile" ? (
        <NumberSetting
          label="Percentile"
          min={0}
          max={percentScale}
          value={Math.round((current.percentile ?? defaultPercentile) * percentScale)}
          onCommit={(percent) => {
            patch({ percentile: Math.min(percent, percentScale) / percentScale });
          }}
        />
      ) : null}
    </>
  );
}

/** How the measure is computed: its aggregate, and what that aggregate takes. */
function ComputeFields(part: MeasurePart): ReactNode {
  const { layout, index, current, onChange } = part;
  return (
    <>
      <SelectSetting
        label="Aggregate"
        choices={aggregateChoices}
        value={current.aggregate}
        onPick={(value) => {
          const next = withAggregate(part, value);
          if (next !== null) {
            onChange(updateMeasure(layout, index, next));
          }
        }}
      />
      <AggregateInputs {...part} />
    </>
  );
}

/** A format part's value from its select. */
function formatPatch(
  key: "decimals" | "abbreviate" | "negative",
  value: string,
): Partial<LayoutFormat> {
  if (key === "decimals") {
    return { decimals: value === "" ? null : Number(value) };
  }
  if (key === "abbreviate") {
    const abbreviate = (["thousands", "millions", "billions"] as const).find(
      (entry) => entry === value,
    );
    return { abbreviate: abbreviate ?? null };
  }
  return { negative: value === "parentheses" ? "parentheses" : "minus" };
}

/** How the measure is shown: as a value or a share, and its number format. */
function ShowFields({ layout, index, current, onChange }: MeasurePart): ReactNode {
  const { format } = current;
  const formats = [
    {
      choices: decimals,
      key: "decimals",
      label: "Decimals",
      value: format?.decimals?.toString() ?? "",
    },
    {
      choices: abbreviations,
      key: "abbreviate",
      label: "Abbreviate",
      value: format?.abbreviate ?? "",
    },
    { choices: negatives, key: "negative", label: "Negatives", value: format?.negative ?? "minus" },
  ] as const;
  return (
    <>
      <SelectSetting
        label="Show as"
        choices={showAsChoices}
        value={current.show_as}
        onPick={(value) => {
          const shown = showAs.find((entry) => entry === value);
          if (shown !== undefined) {
            onChange(updateMeasure(layout, index, { show_as: shown }));
          }
        }}
      />
      {formats.map((entry) => (
        <SelectSetting
          key={entry.key}
          label={entry.label}
          choices={entry.choices}
          value={entry.value}
          onPick={(value) => {
            onChange(withMeasureFormat(layout, index, formatPatch(entry.key, value)));
          }}
        />
      ))}
    </>
  );
}

export { ComputeFields, ShowFields };
export type { MeasurePart };
