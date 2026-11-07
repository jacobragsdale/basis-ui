/* The filter editor of one column, as Excel's filter menu has it: keep the values ticked in a searchable list with
 * their counts, or a condition. Text takes contains, does not contain, starts with, ends with, equals and blank;
 * numbers and dates take comparisons, between and blank. "Does not contain" keeps blanks, as in Excel, and says so. */

import { Button, Input, NativeSelect, NativeSelectOption } from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import type { Layout, LayoutFilter, LayoutScalar } from "#layout/layout.ts";

import type { FieldKind } from "./fields.ts";
import { columnCondition, withColumnCondition } from "./filters.ts";
import type { ColumnCondition } from "./filters.ts";
import { filterValue } from "./labels.ts";
import { ValuePicker } from "./value-picker.tsx";
import type { ValueSource } from "./value-picker.tsx";

/** What the editor can keep rows by. */
type Mode = "values" | "between" | LayoutFilter["op"];

const textModes: readonly Mode[] = [
  "values",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "eq",
  "is_null",
  "is_not_null",
];
const orderedModes: readonly Mode[] = [
  "values",
  "eq",
  "ne",
  "lt",
  "le",
  "gt",
  "ge",
  "between",
  "is_null",
  "is_not_null",
];

/** The conditions a kind of column takes, after the list of values. */
function modesOf(kind: FieldKind): readonly Mode[] {
  if (kind === "text") {
    return textModes;
  }
  return kind === "boolean" ? ["values", "eq", "is_null", "is_not_null"] : orderedModes;
}

const modeText: Readonly<Record<Mode, string>> = {
  between: "Between",
  contains: "Contains",
  ends_with: "Ends with",
  eq: "Equals",
  ge: "At least",
  gt: "Greater than",
  in: "Is one of",
  is_not_null: "Is not blank",
  is_null: "Is blank",
  le: "At most",
  lt: "Less than",
  ne: "Does not equal",
  not_contains: "Does not contain",
  not_in: "Is none of",
  starts_with: "Starts with",
  values: "Values",
};

/** The mode a condition shows in. */
function modeOf(condition: ColumnCondition): Mode {
  if (condition.kind === "none" || condition.kind === "values") {
    return "values";
  }
  return condition.kind === "between" ? "between" : condition.op;
}

/** A value as an input holds it. */
function inputText(value: LayoutScalar | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** What a condition's inputs edit: the condition, how it applies, and the kind of value it takes. */
interface ConditionProps {
  readonly condition: ColumnCondition;
  readonly apply: (condition: ColumnCondition) => void;
  readonly kind: FieldKind;
}

/** A range's two ends, which apply once both are values. */
function RangeInputs({ condition, apply, kind }: ConditionProps): ReactNode {
  const [range, setRange] = useState({
    from: condition.kind === "between" ? inputText(condition.from) : "",
    to: condition.kind === "between" ? inputText(condition.to) : "",
  });
  const between = (): void => {
    const low = filterValue(kind, range.from);
    const high = filterValue(kind, range.to);
    if (low !== null && high !== null) {
      apply({ from: low, kind: "between", to: high });
    }
  };
  return (
    <div className="flex gap-1.5">
      <Input
        aria-label="From"
        placeholder="From"
        value={range.from}
        onBlur={between}
        onChange={(event) => {
          setRange({ ...range, from: event.currentTarget.value });
        }}
      />
      <Input
        aria-label="To"
        placeholder="To"
        value={range.to}
        onBlur={between}
        onChange={(event) => {
          setRange({ ...range, to: event.currentTarget.value });
        }}
      />
    </div>
  );
}

/** A condition's one value, which applies on Enter or when the input loses focus; an empty one clears the filter. */
function ValueInput({
  condition,
  apply,
  kind,
  op,
}: ConditionProps & { readonly op: LayoutFilter["op"] }): ReactNode {
  const [text, setText] = useState(condition.kind === "one" ? inputText(condition.value) : "");
  const single = (): void => {
    const value = filterValue(kind, text);
    apply(value === null ? { kind: "none" } : { kind: "one", op, value });
  };
  return (
    <Input
      aria-label="Value"
      placeholder="Value"
      value={text}
      onBlur={single}
      onChange={(event) => {
        setText(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          single();
        }
      }}
    />
  );
}

/** What a mode edits: the value list, a range, one value, or nothing. */
function ModeEditor(
  props: ConditionProps & {
    readonly mode: Mode;
    readonly column: string;
    readonly source: ValueSource;
  },
): ReactNode {
  const { mode, condition, apply, kind, column, source } = props;
  if (mode === "values") {
    return (
      <ValuePicker
        column={column}
        source={source}
        values={condition.kind === "values" ? condition.values : []}
        searchable={kind === "text"}
        onChange={(values) => {
          apply({ kind: "values", values });
        }}
      />
    );
  }
  if (mode === "between") {
    return <RangeInputs condition={condition} apply={apply} kind={kind} />;
  }
  return mode === "is_null" || mode === "is_not_null" ? null : (
    <ValueInput condition={condition} apply={apply} kind={kind} op={mode} />
  );
}

/** The choice of what to keep rows by. */
function ModeSelect({
  modes,
  mode,
  onPick,
}: {
  readonly modes: readonly Mode[];
  readonly mode: Mode;
  readonly onPick: (value: string) => void;
}): ReactNode {
  return (
    <NativeSelect
      aria-label="Keep rows where"
      value={mode}
      onChange={(event) => {
        onPick(event.currentTarget.value);
      }}
    >
      {modes.map((entry) => (
        <NativeSelectOption key={entry} value={entry}>
          {modeText[entry]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

interface ColumnFilterProps {
  readonly layout: Layout;
  readonly column: string;
  readonly kind: FieldKind;
  readonly source: ValueSource;
  readonly onChange: (layout: Layout) => void;
}

/** A column's filter editor. */
function ColumnFilter({ layout, column, kind, source, onChange }: ColumnFilterProps): ReactNode {
  const condition = columnCondition(layout, column);
  const key = JSON.stringify([column, condition]);
  // The mode chosen here, until the filter changes, which then shows its own.
  const [chosen, setChosen] = useState<{ readonly key: string; readonly mode: Mode } | null>(null);
  const mode = chosen?.key === key ? chosen.mode : modeOf(condition);
  const modes = modesOf(kind);
  const apply = (next: ColumnCondition): void => {
    onChange(withColumnCondition(layout, column, next));
  };
  const pick = (value: string): void => {
    const next = modes.find((entry) => entry === value) ?? "values";
    setChosen({ key, mode: next });
    // Conditions without a value apply at once; the others wait for one.
    if (next === "is_null" || next === "is_not_null") {
      apply({ kind: "one", op: next, value: null });
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <ModeSelect modes={modes} mode={mode} onPick={pick} />
      {/* A condition's inputs start again from the filter when it changes; the value list keeps its search. */}
      <ModeEditor
        key={mode === "values" ? mode : `${key}:${mode}`}
        mode={mode}
        condition={condition}
        apply={apply}
        kind={kind}
        column={column}
        source={source}
      />
      {mode === "not_contains" ? (
        <p className="text-xs text-muted-foreground">Blank cells are kept, as in Excel.</p>
      ) : null}
      {condition.kind === "none" ? null : (
        <Button
          variant="link"
          size="xs"
          onClick={() => {
            apply({ kind: "none" });
          }}
        >
          Clear filter
        </Button>
      )}
    </div>
  );
}

export { ColumnFilter };
