/* DateRangePicker's presets, each a button that sets its range at once, and its typed entry: two fields, From and To,
 * under the presets and the grid, which take a typed `2026-11-06` or `11/06/2026` and set the range on Enter or Apply,
 * in either order, and say why when one cannot be taken, as the grid would refuse it; and Clear, which empties the
 * range. */

import { useId, useState } from "react";
import type { ReactElement } from "react";

import type { DateRange } from "#dates/periods.ts";

import { Button } from "./button.tsx";
import type { PickRules } from "./date-picking.ts";
import { presetLabel } from "./date-range-presets.ts";
import type { DateRangePreset } from "./date-range-presets.ts";
import { typedRange } from "./date-range-text.ts";
import { FieldError } from "./field.tsx";
import { Input } from "./input.tsx";
import { Label } from "./label.tsx";

/** The presets, each setting its range at once; nothing when there are none. */
function PresetList({
  presets,
  onPreset,
}: {
  readonly presets: readonly DateRangePreset[];
  readonly onPreset: (preset: DateRangePreset) => void;
}): ReactElement | null {
  if (presets.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      {presets.map((preset) => (
        <Button
          key={preset}
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={() => {
            onPreset(preset);
          }}
        >
          {presetLabel(preset)}
        </Button>
      ))}
    </div>
  );
}

interface RangeEntryProps {
  readonly current: DateRange | null;
  readonly rules: PickRules;
  readonly onChoose: (range: DateRange) => void;
  readonly onClear: () => void;
}

/** One typed end of the range, under its label. */
function EndField({
  label,
  value,
  onChange,
  errorId,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly errorId: string;
}): ReactElement {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder="YYYY-MM-DD"
        autoComplete="off"
        spellCheck={false}
        aria-describedby={errorId}
        className="w-full"
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
    </div>
  );
}

/** The typed range, Apply and Clear. */
function RangeEntry({ current, rules, onChoose, onClear }: RangeEntryProps): ReactElement {
  const [from, setFrom] = useState(current?.start.toString() ?? "");
  const [to, setTo] = useState(current?.end.toString() ?? "");
  const [reason, setReason] = useState<string | undefined>();
  const errorId = useId();
  return (
    <form
      aria-label="Type a range"
      className="flex flex-col gap-2 border-t border-edge pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        const typed = typedRange(from, to, rules);
        if ("reason" in typed) {
          setReason(typed.reason);
        } else {
          onChoose(typed.range);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <EndField label="From" value={from} onChange={setFrom} errorId={errorId} />
        <EndField label="To" value={to} onChange={setTo} errorId={errorId} />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={current === null}
          onClick={onClear}
        >
          Clear
        </Button>
        <Button type="submit" size="sm">
          Apply
        </Button>
      </div>
      <FieldError id={errorId} errors={reason === undefined ? undefined : [reason]} />
    </form>
  );
}

export { PresetList, RangeEntry };
