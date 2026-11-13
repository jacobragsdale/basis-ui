/* A filter bar's range of numbers: two AmountInputs, Min and Max, either left empty, read by the filter's suffixes and
 * written to the address once typing pauses (filter-draft.ts), only while both read and Min is not above Max. An
 * inverted range is never written: the address would read it as no filter, and the inputs would take that back as
 * empty, so `5` typed in Max on the way to `5mm` would blank both. Once the range is left inverted, Max says so. */

import { useId, useState } from "react";
import type { FocusEvent, ReactElement } from "react";

import { AmountInput } from "./amount-input.tsx";
import { isNumberRangeValue } from "./filter-definitions.ts";
import type { AnyFilterValue, NumberRangeFilter } from "./filter-definitions.ts";
import { useFilterDraft } from "./filter-draft.ts";
import type { DraftGroup } from "./filter-draft.ts";
import type { FilterWrite } from "./filter-state.ts";
import { Field, FieldLabel } from "./field.tsx";

interface NumberRangeControlProps {
  readonly definition: NumberRangeFilter;
  /** The filter's value as the address holds it, or `undefined` while it is not active. */
  readonly value: AnyFilterValue | undefined;
  readonly onChange: (value: AnyFilterValue | undefined, write?: FilterWrite) => void;
}

/** What a range's two inputs hold: a number, `null` while empty, or the text while it reads as no number. */
interface RangeDraft {
  readonly min: number | string | null;
  readonly max: number | string | null;
}

function sameRange(left: RangeDraft, right: RangeDraft): boolean {
  return left.min === right.min && left.max === right.max;
}

/** Whether both ends read and Min is above Max, a range the address cannot hold. */
function isInverted({ min, max }: RangeDraft): boolean {
  return typeof min === "number" && typeof max === "number" && min > max;
}

/** The range's draft, and whether it was left inverted, until it is typed in again. */
function useRangeDraft({ value, onChange }: Omit<NumberRangeControlProps, "definition">): {
  readonly draft: RangeDraft;
  readonly change: (next: RangeDraft) => void;
  readonly group: DraftGroup;
  readonly inverted: boolean;
} {
  const range = isNumberRangeValue(value) ? value : undefined;
  const [leftInverted, setLeftInverted] = useState(false);
  const typed = useFilterDraft<RangeDraft>({
    commit: ({ min, max }, replace) => {
      if (typeof min === "string" || typeof max === "string" || isInverted({ max, min })) {
        return false;
      }
      onChange({ max: max ?? undefined, min: min ?? undefined }, { replace });
      return true;
    },
    same: sameRange,
    value: { max: range?.max ?? null, min: range?.min ?? null },
  });
  return {
    change: (next) => {
      setLeftInverted(false);
      typed.change(next);
    },
    draft: typed.draft,
    group: {
      onBlur: (event: FocusEvent<HTMLElement>) => {
        typed.group.onBlur(event);
        const to = event.relatedTarget;
        if (!(to instanceof Node && event.currentTarget.contains(to))) {
          setLeftInverted(isInverted(typed.draft));
        }
      },
      onKeyDown: typed.group.onKeyDown,
    },
    inverted: leftInverted && isInverted(typed.draft),
  };
}

/** A range of numbers: two AmountInputs, either left empty, written once typing pauses and only while both read and
 * Min is not above Max. */
function NumberRangeControl({ definition, ...props }: NumberRangeControlProps): ReactElement {
  const labelId = useId();
  const minId = useId();
  const { draft, change, group, inverted } = useRangeDraft(props);
  return (
    <Field data-slot="filter" className="w-64" aria-labelledby={labelId} {...group}>
      <FieldLabel id={labelId} htmlFor={minId}>
        {definition.label}
      </FieldLabel>
      <div className="flex items-start gap-2">
        <AmountInput
          id={minId}
          aria-label="Min"
          placeholder="Min"
          suffixes={definition.suffixes}
          value={draft.min}
          onValueChange={(min) => {
            change({ ...draft, min });
          }}
        />
        <AmountInput
          aria-label="Max"
          placeholder="Max"
          suffixes={definition.suffixes}
          value={draft.max}
          aria-invalid={inverted ? true : undefined}
          errors={inverted ? [{ message: "Max is below Min." }] : undefined}
          onValueChange={(max) => {
            change({ ...draft, max });
          }}
        />
      </div>
    </Field>
  );
}

export { NumberRangeControl };
