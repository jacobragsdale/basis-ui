/* DateRangePicker: a range of business days, such as a report's period. A button shows the range and opens a popover
 * holding the presets beside the month grid AsOfDatePicker uses (date-grid.tsx has its keys). A preset sets the range
 * at once: month, quarter or year to date, or the whole month, quarter or year before, each from its period's first
 * business day to a business day (date-range-presets.ts). In the grid, the first day picked starts the range and the
 * second ends it, in either order.
 *
 * The presets count from an as-of date: the last business day before today in New York unless the field sets one. Like
 * AsOfDatePicker, the field names its calendar, SIFMA's unless it names another, and takes business days only, up to
 * today unless it sets other bounds. The button's text is the range, which is also its description, so a button named
 * by a FieldLabel still reads its range. It is drawn as a Select's trigger, with its sizes, since it is a field that
 * opens a picker rather than an action. */

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import { useId, useState } from "react";
import type { ComponentProps, ReactElement } from "react";

import type { Calendar } from "#dates/calendar.ts";
import type { DateRange } from "#dates/periods.ts";
import { sifma } from "#dates/sifma.ts";
import type { VariantProps } from "#vendor/cva/cva.ts";
import { CalendarIcon } from "#vendor/lucide/calendar.tsx";

import { Button } from "./button.tsx";
import { DateGrid } from "./date-grid.tsx";
import { defaultAsOfDate, pickRules } from "./date-picking.ts";
import type { PickRules } from "./date-picking.ts";
import { dateRangePresets, presetLabel, rangeForPreset } from "./date-range-presets.ts";
import type { DateRangePreset } from "./date-range-presets.ts";
import { idList, useControlled, useGridPopover, useToday } from "./field-state.ts";
import type { GridPopover } from "./field-state.ts";
import { Popover, PopoverContent } from "./popover.tsx";
import { selectTriggerVariants as dateRangePickerVariants } from "./select-variants.ts";

interface DateRangePickerProps
  extends
    Omit<ComponentProps<"button">, "value" | "defaultValue" | "onChange" | "children" | "type">,
    VariantProps<typeof dateRangePickerVariants> {
  /** The range, or `null` for none. Leave it out for an uncontrolled field. */
  readonly value?: DateRange | null | undefined;
  /** The range an uncontrolled field starts with; none unless set. */
  readonly defaultValue?: DateRange | null | undefined;
  /** Called with the range when a preset is chosen or a second day picked. */
  readonly onValueChange?: ((value: DateRange) => void) | undefined;
  /** The calendar whose business days the field takes; SIFMA's unless set. */
  readonly calendar?: Calendar | undefined;
  /** The earliest date the field takes; none unless set. */
  readonly min?: Temporal.PlainDate | undefined;
  /** The latest date the field takes: `today` unless set, and none when `null`. */
  readonly max?: Temporal.PlainDate | null | undefined;
  /** Today, which the as-of date and the latest date count from; today in New York unless set. */
  readonly today?: Temporal.PlainDate | undefined;
  /** The date the presets run to: the last business day before `today` unless set. */
  readonly asOf?: Temporal.PlainDate | undefined;
  /** The presets offered, in order; all six unless set, and none when empty. */
  readonly presets?: readonly DateRangePreset[] | undefined;
  /** The button's text while there is no range; "Pick a range" unless set. */
  readonly placeholder?: string | undefined;
  /** The name of the popover's dialog; "Choose a date range" unless set. */
  readonly pickerLabel?: string | undefined;
}

/** A range as the button writes it: `2026-10-01 – 2026-11-06`. */
function rangeText(range: DateRange): string {
  return `${range.start.toString()} – ${range.end.toString()}`;
}

/** The range from two picked days, in either order. */
function rangeOf(first: Temporal.PlainDate, second: Temporal.PlainDate): DateRange {
  return Temporal.PlainDate.compare(first, second) <= 0
    ? { end: second, start: first }
    : { end: first, start: second };
}

/** Whether two optional ranges are the same days. */
function sameRange(left: DateRange | null, right: DateRange | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.start.equals(right.start) && left.end.equals(right.end);
}

interface RangePopoverProps {
  readonly label: string;
  readonly popover: GridPopover;
  readonly current: DateRange | null;
  readonly presets: readonly DateRangePreset[];
  readonly asOf: Temporal.PlainDate;
  readonly rules: PickRules;
  readonly today: Temporal.PlainDate;
  readonly onChoose: (range: DateRange) => void;
}

type RangeBodyProps = Omit<RangePopoverProps, "label">;

/** The presets and the month grid. The first day picked in the grid is held until the second ends the range; it lives
 * inside the popup, so closing the popover lets it go. */
function RangeBody({
  popover,
  current,
  presets,
  asOf,
  rules,
  today,
  onChoose,
}: RangeBodyProps): ReactElement {
  const [anchor, setAnchor] = useState<Temporal.PlainDate | null>(null);
  return (
    <div className="flex gap-4">
      {presets.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          {presets.map((preset) => (
            <Button
              key={preset}
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => {
                onChoose(rangeForPreset(preset, asOf, rules.calendar));
              }}
            >
              {presetLabel(preset)}
            </Button>
          ))}
        </div>
      )}
      <DateGrid
        focused={popover.focused}
        onFocusedChange={popover.handleFocusedChange}
        selection={anchor === null ? (current ?? undefined) : { end: anchor, start: anchor }}
        onPick={(date) => {
          setAnchor(anchor === null ? date : null);
          if (anchor !== null) {
            onChoose(rangeOf(anchor, date));
          }
        }}
        rules={rules}
        today={today}
        tableId={popover.tableId}
      />
    </div>
  );
}

/** The popup, named for assistive technology, holding the presets and the grid. */
function RangePopover({ label, ...body }: RangePopoverProps): ReactElement {
  return (
    <PopoverContent
      align="start"
      aria-label={label}
      className="w-auto"
      initialFocus={body.popover.initialFocus}
    >
      <RangeBody {...body} />
    </PopoverContent>
  );
}

type FieldProps = Pick<
  DateRangePickerProps,
  "value" | "defaultValue" | "onValueChange" | "calendar" | "min" | "max" | "today" | "asOf"
>;

/** The field's state: its range, and the popover with its presets and grid. */
function useRangeField({
  value,
  defaultValue = null,
  onValueChange,
  calendar = sifma,
  min,
  max,
  today,
  asOf,
}: FieldProps): {
  readonly current: DateRange | null;
  readonly popover: GridPopover;
  readonly body: Omit<RangePopoverProps, "label" | "presets">;
} {
  const now = useToday(today);
  const { day } = now;
  const untilFrom = (from: Temporal.PlainDate): Temporal.PlainDate =>
    asOf ?? defaultAsOfDate({ calendar, today: from });
  const until = untilFrom(day);
  const [current, change] = useControlled<DateRange | null>({
    initial: () => defaultValue,
    onChange: (next) => {
      if (next !== null) {
        onValueChange?.(next);
      }
    },
    same: sameRange,
    value,
  });
  const popover = useGridPopover((from) => current?.end ?? untilFrom(from), now);
  const onChoose = (range: DateRange): void => {
    change(range);
    popover.close();
  };
  const rules = pickRules({ calendar, max, min, today: day });
  return { body: { asOf: until, current, onChoose, popover, rules, today: day }, current, popover };
}

interface RangeTriggerProps
  extends
    Omit<ComponentProps<"button">, "value" | "defaultValue" | "onChange" | "children" | "type">,
    VariantProps<typeof dateRangePickerVariants> {
  /** The range in words, or `undefined` while there is none. */
  readonly text: string | undefined;
  readonly placeholder: string;
}

/** The button that shows the range and opens the popover. Its text describes it, so a button a FieldLabel names still
 * reads its range. */
function RangeTrigger({
  text,
  placeholder,
  size = "default",
  className,
  "aria-describedby": describedBy,
  ...props
}: RangeTriggerProps): ReactElement {
  const textId = useId();
  return (
    <PopoverPrimitive.Trigger
      data-slot="date-range-picker"
      data-size={size}
      data-placeholder={text === undefined ? "" : undefined}
      aria-describedby={idList(textId, describedBy)}
      className={cn(dateRangePickerVariants({ size }), className)}
      {...props}
    >
      <span id={textId} className="tabular-nums">
        {text ?? placeholder}
      </span>
      <CalendarIcon />
    </PopoverPrimitive.Trigger>
  );
}

/** A date range field. Name it with a FieldLabel's `htmlFor` and this `id`, or with `aria-label`.
 *
 * @use For a period of business days, such as month to date or a range the user picks. For one date, use
 * AsOfDatePicker.
 * @see Field, FieldLabel, AsOfDatePicker, dateRangePresets, rangeForPreset, DateRange
 *
 * @example
 * ```tsx
 * import { DateRangePicker, Field, FieldLabel } from "@basis/ui";
 *
 * <Field>
 *   <FieldLabel htmlFor="period">Period</FieldLabel>
 *   <DateRangePicker id="period" onValueChange={() => undefined} />
 * </Field>;
 * ```
 */
function DateRangePicker({
  value,
  defaultValue,
  onValueChange,
  calendar,
  min,
  max,
  today,
  asOf,
  presets = dateRangePresets,
  placeholder = "Pick a range",
  pickerLabel = "Choose a date range",
  size = "default",
  className,
  ...props
}: DateRangePickerProps): ReactElement {
  const field = useRangeField({
    asOf,
    calendar,
    defaultValue,
    max,
    min,
    onValueChange,
    today,
    value,
  });
  return (
    <Popover
      open={field.popover.open}
      modal="trap-focus"
      onOpenChange={field.popover.handleOpenChange}
    >
      <RangeTrigger
        size={size}
        className={className}
        text={field.current === null ? undefined : rangeText(field.current)}
        placeholder={placeholder}
        {...props}
      />
      <RangePopover label={pickerLabel} presets={presets} {...field.body} />
    </Popover>
  );
}

export { DateRangePicker };
