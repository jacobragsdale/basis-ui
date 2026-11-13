/* The inputs of a column's condition: one value, or a range's two ends, each read as the column shows its values,
 * which apply on Enter, or on leaving a box whose text changed, and which Escape puts back; and the engine's refusal
 * of what they applied, beside them. */

import { Input } from "@basis/ui";
import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import type { LayoutFilter, LayoutFormat, LayoutScalar } from "#layout/layout.ts";

import type { FieldKind } from "./fields.ts";
import type { ColumnCondition } from "./filters.ts";
import { filterValue } from "./labels.ts";

/** A value as an input holds it. */
function inputText(value: LayoutScalar | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** What a condition's inputs edit: the condition, how it applies, and the kind of value it takes and the format its
 * column is shown in, which a typed value is read by. */
interface ConditionProps {
  readonly condition: ColumnCondition;
  readonly apply: (condition: ColumnCondition) => void;
  readonly kind: FieldKind;
  readonly format: LayoutFormat | undefined;
}

/** What a typed box does with the keys that end it: Enter applies, and Escape puts the text back and applies
 * nothing, as leaving the box after Escape does not either. */
function useTyped(
  initial: string,
  applyText: (text: string) => void,
): {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly blur: () => void;
  readonly keyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
} {
  const [text, setText] = useState(initial);
  const cancelled = useRef(false);
  return {
    // Leaving a box whose text did not change applies nothing, so passing through an empty box clears no filter.
    blur: () => {
      if (!cancelled.current && text !== initial) {
        applyText(text);
      }
      cancelled.current = false;
    },
    keyDown: (event) => {
      if (event.key === "Enter") {
        applyText(text);
      } else if (event.key === "Escape") {
        cancelled.current = true;
        setText(initial);
      }
    },
    setText,
    text,
  };
}

/** A range's two ends, which apply once both are values. */
function RangeInputs({ condition, apply, kind, format }: ConditionProps): ReactNode {
  const [range, setRange] = useState({
    from: condition.kind === "between" ? inputText(condition.from) : "",
    to: condition.kind === "between" ? inputText(condition.to) : "",
  });
  const between = (): void => {
    const low = filterValue(kind, range.from, format);
    const high = filterValue(kind, range.to, format);
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
  format,
  op,
}: ConditionProps & { readonly op: LayoutFilter["op"] }): ReactNode {
  const { text, setText, blur, keyDown } = useTyped(
    condition.kind === "one" ? inputText(condition.value) : "",
    (typed) => {
      const value = filterValue(kind, typed, format);
      apply(value === null ? { kind: "none" } : { kind: "one", op, value });
    },
  );
  return (
    <Input
      aria-label="Value"
      placeholder="Value"
      value={text}
      onBlur={blur}
      onChange={(event) => {
        setText(event.currentTarget.value);
      }}
      onKeyDown={keyDown}
    />
  );
}

/** Why the engine refused the latest change, beside the box that made it, so a value it could not read says so. */
function Refusal({ error }: { readonly error: string | null }): ReactNode {
  return error === null ? null : (
    <p role="alert" className="text-xs text-destructive">
      {error}
    </p>
  );
}

export { RangeInputs, Refusal, ValueInput };
export type { ConditionProps };
