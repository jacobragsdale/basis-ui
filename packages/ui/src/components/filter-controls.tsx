/* One filter's control in the filter bar, by its kind, each labelled by the filter's label: a search box for text, a
 * Select for a choice with "Any" for none, a multiple Combobox with chips for several, a DateRangePicker for a range of
 * days, and two AmountInputs for a range of numbers. A choice, the options and the dates go to the address as they are
 * picked; text and numbers go once typing pauses, one history entry each time the field is used (filter-draft.ts). */

import { useId } from "react";
import type { ReactElement } from "react";

import { SearchIcon } from "#vendor/lucide/search.tsx";

import { AmountInput } from "./amount-input.tsx";
import { useComboboxAnchor } from "./combobox-anchor.ts";
import { ComboboxChip, ComboboxChips, ComboboxChipsInput } from "./combobox-chips.tsx";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "./combobox.tsx";
import { DateRangePicker } from "./date-range-picker.tsx";
import {
  chosenOf,
  isDateRangeValue,
  isNumberRangeValue,
  optionLabel,
  optionsOf,
} from "./filter-definitions.ts";
import type {
  AnyFilterValue,
  ChoiceFilter,
  DateRangeFilter,
  FilterDefinition,
  MultiChoiceFilter,
  NumberRangeFilter,
  TextFilter,
} from "./filter-definitions.ts";
import { useFilterDraft } from "./filter-draft.ts";
import type { FilterWrite } from "./filter-state.ts";
import { Field, FieldLabel } from "./field.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.tsx";

interface ControlProps<TDefinition extends FilterDefinition> {
  readonly definition: TDefinition;
  /** The filter's value as the address holds it, or `undefined` while it is not active. */
  readonly value: AnyFilterValue | undefined;
  readonly onChange: (value: AnyFilterValue | undefined, write?: FilterWrite) => void;
}

/** A text filter: a search box whose text goes to the address once typing pauses. */
function TextControl({ definition, value, onChange }: ControlProps<TextFilter>): ReactElement {
  const id = useId();
  const typed = useFilterDraft({
    commit: (text, replace) => {
      onChange(text, { replace });
      return true;
    },
    same: (left, right) => left === right,
    value: typeof value === "string" ? value : "",
  });
  return (
    <Field data-slot="filter" className="w-56" {...typed.group}>
      <FieldLabel htmlFor={id}>{definition.label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="search"
          autoComplete="off"
          placeholder={definition.placeholder}
          value={typed.draft}
          onChange={(event) => {
            typed.change(event.target.value);
          }}
        />
      </InputGroup>
    </Field>
  );
}

/** A choice: a Select of the options, after "Any", which clears it. */
function ChoiceControl({ definition, value, onChange }: ControlProps<ChoiceFilter>): ReactElement {
  const id = useId();
  const items = [{ label: "Any", value: null }, ...optionsOf(definition)];
  return (
    <Field data-slot="filter" className="w-44">
      <FieldLabel htmlFor={id}>{definition.label}</FieldLabel>
      <Select
        items={items}
        value={typeof value === "string" ? value : null}
        onValueChange={(next: string | null) => {
          onChange(next ?? undefined);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value ?? ""} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Several of the options: a multiple Combobox, its choices as chips, its list found by the options' labels. */
function MultiChoiceControl({
  definition,
  value,
  onChange,
}: ControlProps<MultiChoiceFilter>): ReactElement {
  const id = useId();
  const anchor = useComboboxAnchor();
  const labelOf = (option: string): string => optionLabel(definition, option);
  const chosen = chosenOf(value);
  return (
    <Field data-slot="filter" className="w-72">
      <FieldLabel htmlFor={id}>{definition.label}</FieldLabel>
      <Combobox
        multiple
        items={optionsOf(definition).map((option) => option.value)}
        itemToStringLabel={labelOf}
        value={[...chosen]}
        onValueChange={(next: string[]) => {
          onChange(next);
        }}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(shown: readonly string[]) => (
              <>
                {shown.map((option) => (
                  <ComboboxChip key={option}>{labelOf(option)}</ComboboxChip>
                ))}
                <ComboboxChipsInput id={id} placeholder={shown.length === 0 ? "Any" : undefined} />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No option matches.</ComboboxEmpty>
          <ComboboxList>
            {(option: string) => (
              <ComboboxItem key={option} value={option}>
                {labelOf(option)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

/** A range of days: a DateRangePicker, its range written as ISO 8601 dates. */
function DateRangeControl({
  definition,
  value,
  onChange,
}: ControlProps<DateRangeFilter>): ReactElement {
  const id = useId();
  const range = isDateRangeValue(value) ? value : undefined;
  return (
    <Field data-slot="filter" className="w-80">
      <FieldLabel htmlFor={id}>{definition.label}</FieldLabel>
      <DateRangePicker
        id={id}
        placeholder="Any dates"
        value={
          range === undefined
            ? null
            : {
                end: Temporal.PlainDate.from(range.end),
                start: Temporal.PlainDate.from(range.start),
              }
        }
        onValueChange={({ start, end }) => {
          onChange({ end: end.toString(), start: start.toString() });
        }}
        calendar={definition.calendar}
        min={definition.min}
        max={definition.max ?? null}
        presets={definition.presets}
      />
    </Field>
  );
}

/** What a range's two inputs hold: a number, `null` while empty, or the text while it reads as no number. */
interface RangeDraft {
  readonly min: number | string | null;
  readonly max: number | string | null;
}

function sameRange(left: RangeDraft, right: RangeDraft): boolean {
  return left.min === right.min && left.max === right.max;
}

/** A range of numbers: two AmountInputs, either left empty, written once typing pauses and only while both read. */
function NumberRangeControl({
  definition,
  value,
  onChange,
}: ControlProps<NumberRangeFilter>): ReactElement {
  const labelId = useId();
  const minId = useId();
  const range = isNumberRangeValue(value) ? value : undefined;
  const typed = useFilterDraft<RangeDraft>({
    commit: ({ min, max }, replace) => {
      if (typeof min === "string" || typeof max === "string") {
        return false;
      }
      onChange({ max: max ?? undefined, min: min ?? undefined }, { replace });
      return true;
    },
    same: sameRange,
    value: { max: range?.max ?? null, min: range?.min ?? null },
  });
  return (
    <Field data-slot="filter" className="w-64" aria-labelledby={labelId} {...typed.group}>
      <FieldLabel id={labelId} htmlFor={minId}>
        {definition.label}
      </FieldLabel>
      <div className="flex items-start gap-2">
        <AmountInput
          id={minId}
          aria-label="Min"
          placeholder="Min"
          suffixes={definition.suffixes}
          value={typed.draft.min}
          onValueChange={(min) => {
            typed.change({ ...typed.draft, min });
          }}
        />
        <AmountInput
          aria-label="Max"
          placeholder="Max"
          suffixes={definition.suffixes}
          value={typed.draft.max}
          onValueChange={(max) => {
            typed.change({ ...typed.draft, max });
          }}
        />
      </div>
    </Field>
  );
}

/** A filter's control, by its kind. */
function FilterControl({
  definition,
  ...props
}: ControlProps<FilterDefinition>): ReactElement | null {
  switch (definition.kind) {
    case "text": {
      return <TextControl definition={definition} {...props} />;
    }
    case "choice": {
      return <ChoiceControl definition={definition} {...props} />;
    }
    case "multiChoice": {
      return <MultiChoiceControl definition={definition} {...props} />;
    }
    case "dateRange": {
      return <DateRangeControl definition={definition} {...props} />;
    }
    case "numberRange": {
      return <NumberRangeControl definition={definition} {...props} />;
    }
    default: {
      return null;
    }
  }
}

export { FilterControl };
