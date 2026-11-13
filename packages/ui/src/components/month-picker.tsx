/* MonthPicker: a month, such as a statement's or a report's, as a `Temporal.PlainYearMonth`. A button shows the month
 * and opens a popover with the year, its previous and next, and its twelve months as buttons, the chosen one pressed
 * and those outside the field's bounds disabled. The arrow keys move between the months, a row being a quarter, and
 * stop at a bound, so the month focused, the one Tab reaches, is always one the field takes; the grid opens on the
 * month, or this one, held within the bounds, and a year with no month the field takes cannot be stepped to. It is
 * drawn as a Select's trigger, with its sizes, as DateRangePicker is. */

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import { useId, useState } from "react";
import { flushSync } from "react-dom";
import type { ComponentProps, KeyboardEvent, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";
import { CalendarIcon } from "#vendor/lucide/calendar.tsx";
import { ChevronLeftIcon } from "#vendor/lucide/chevron-left.tsx";
import { ChevronRightIcon } from "#vendor/lucide/chevron-right.tsx";

import { Button } from "./button.tsx";
import { todayInNewYork } from "./date-picking.ts";
import { useControlled } from "./field-state.ts";
import {
  clamped,
  monthName,
  months,
  moved,
  shortName,
  within,
  yearWithin,
} from "./month-picker-months.ts";
import { Popover, PopoverContent } from "./popover.tsx";
import { selectTriggerVariants as monthPickerVariants } from "./select-variants.ts";

interface MonthPickerProps
  extends
    Omit<ComponentProps<"button">, "value" | "defaultValue" | "onChange" | "children" | "type">,
    VariantProps<typeof monthPickerVariants> {
  /** The month, or `null` for none. Leave it out for an uncontrolled field. */
  readonly value?: Temporal.PlainYearMonth | null | undefined;
  /** The month an uncontrolled field starts with; none unless set. */
  readonly defaultValue?: Temporal.PlainYearMonth | null | undefined;
  /** Called with the month when one is chosen. */
  readonly onValueChange?: ((value: Temporal.PlainYearMonth) => void) | undefined;
  /** The earliest month the field takes; none unless set. */
  readonly min?: Temporal.PlainYearMonth | undefined;
  /** The latest month the field takes; none unless set. */
  readonly max?: Temporal.PlainYearMonth | undefined;
  /** The button's text while there is no month; "Pick a month" unless set. */
  readonly placeholder?: string | undefined;
  /** The name of the popover's dialog; "Choose a month" unless set. */
  readonly pickerLabel?: string | undefined;
}

interface MonthGridProps {
  readonly current: Temporal.PlainYearMonth | null;
  readonly focused: Temporal.PlainYearMonth;
  readonly onFocusedChange: (month: Temporal.PlainYearMonth) => void;
  readonly onChoose: (month: Temporal.PlainYearMonth) => void;
  readonly bounds: Pick<MonthPickerProps, "min" | "max">;
  readonly gridId: string;
}

/** The year shown, between the buttons to the year before and after it. */
function YearHeader({
  focused,
  onFocusedChange,
  bounds,
}: Pick<MonthGridProps, "focused" | "onFocusedChange" | "bounds">): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous year"
        disabled={!yearWithin(focused.year - 1, bounds)}
        onClick={() => {
          onFocusedChange(clamped(focused.subtract({ years: 1 }), bounds));
        }}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="text-sm font-medium" aria-live="polite">
        {String(focused.year)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next year"
        disabled={!yearWithin(focused.year + 1, bounds)}
        onClick={() => {
          onFocusedChange(clamped(focused.add({ years: 1 }), bounds));
        }}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

/** One month's button, named by its short name and its year, as "Oct 2026", the year unseen: pressed when chosen,
 * disabled outside the bounds, and the only one Tab reaches when focused. */
function MonthButton({
  month,
  grid,
}: {
  readonly month: Temporal.PlainYearMonth;
  readonly grid: MonthGridProps;
}): ReactElement {
  const chosen = grid.current?.equals(month) ?? false;
  return (
    <Button
      variant={chosen ? "default" : "ghost"}
      size="sm"
      aria-pressed={chosen}
      disabled={!within(month, grid.bounds)}
      tabIndex={month.equals(grid.focused) ? 0 : -1}
      onClick={() => {
        grid.onChoose(month);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        const step = moved(month, event.key);
        const next = step === undefined ? undefined : clamped(step, grid.bounds);
        if (next !== undefined) {
          event.preventDefault();
          // The month takes the focus at once, so a key pressed straight after lands on it.
          flushSync(() => {
            grid.onFocusedChange(next);
          });
          document
            .querySelector<HTMLElement>(`#${CSS.escape(grid.gridId)} [tabindex="0"]`)
            ?.focus();
        }
      }}
    >
      {shortName(month)}
      <span className="sr-only"> {String(month.year)}</span>
    </Button>
  );
}

/** The year with its previous and next, and its months. */
function MonthGrid(grid: MonthGridProps): ReactElement {
  const { focused, onFocusedChange } = grid;
  const { year } = focused;
  return (
    <div className="flex w-56 flex-col gap-2">
      <YearHeader focused={focused} onFocusedChange={onFocusedChange} bounds={grid.bounds} />
      <fieldset
        id={grid.gridId}
        aria-label={`Months of ${String(year)}`}
        className="grid grid-cols-3 gap-1"
      >
        {months.map((number) => (
          <MonthButton
            key={number}
            month={Temporal.PlainYearMonth.from({ month: number, year })}
            grid={grid}
          />
        ))}
      </fieldset>
    </div>
  );
}

/** The field's month and the popover's state. */
function useMonthField({
  value,
  defaultValue = null,
  onValueChange,
  min,
  max,
}: Pick<MonthPickerProps, "value" | "defaultValue" | "onValueChange" | "min" | "max">): {
  readonly current: Temporal.PlainYearMonth | null;
  readonly open: boolean;
  readonly handleOpenChange: (open: boolean) => void;
  readonly focused: Temporal.PlainYearMonth;
  readonly handleFocusedChange: (month: Temporal.PlainYearMonth) => void;
  readonly handleChoose: (month: Temporal.PlainYearMonth) => void;
} {
  const [open, setOpen] = useState(false);
  const [current, change] = useControlled<Temporal.PlainYearMonth | null>({
    initial: () => defaultValue,
    onChange: (next) => {
      if (next !== null) {
        onValueChange?.(next);
      }
    },
    same: (left, right) => (left === null || right === null ? left === right : left.equals(right)),
    value,
  });
  // The grid opens on the month, or this one, held within the bounds, so the month focused is one Tab reaches.
  const start = (): Temporal.PlainYearMonth =>
    clamped(current ?? todayInNewYork().toPlainYearMonth(), { max, min });
  const [focused, setFocused] = useState(start);
  return {
    current,
    focused,
    handleChoose: (month) => {
      change(month);
      setOpen(false);
    },
    handleFocusedChange: setFocused,
    handleOpenChange: (next) => {
      if (next) {
        setFocused(start());
      }
      setOpen(next);
    },
    open,
  };
}

/** A month field. Name it with a FieldLabel's `htmlFor` and this `id`, or with `aria-label`.
 *
 * @use For a month, such as a statement's or a report's period. For a day, use DatePicker; for a range of days,
 * DateRangePicker.
 * @see Field, FieldLabel, DatePicker, DateRangePicker
 *
 * @example
 * ```tsx
 * import { Field, FieldLabel, MonthPicker } from "@basis/ui";
 *
 * <Field>
 *   <FieldLabel htmlFor="statement">Statement month</FieldLabel>
 *   <MonthPicker id="statement" defaultValue={Temporal.PlainYearMonth.from("2026-10")} />
 * </Field>;
 * ```
 */
function MonthPicker({
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  placeholder = "Pick a month",
  pickerLabel = "Choose a month",
  size = "default",
  className,
  ...props
}: MonthPickerProps): ReactElement {
  const gridId = useId();
  const field = useMonthField({ defaultValue, max, min, onValueChange, value });
  return (
    <Popover open={field.open} modal="trap-focus" onOpenChange={field.handleOpenChange}>
      <PopoverPrimitive.Trigger
        data-slot="month-picker"
        data-size={size}
        data-placeholder={field.current === null ? "" : undefined}
        className={cn(monthPickerVariants({ size }), className)}
        {...props}
      >
        <span>{field.current === null ? placeholder : monthName(field.current)}</span>
        <CalendarIcon />
      </PopoverPrimitive.Trigger>
      <PopoverContent
        align="start"
        aria-label={pickerLabel}
        className="w-auto"
        initialFocus={() =>
          document.querySelector<HTMLElement>(`#${CSS.escape(gridId)} [tabindex="0"]`) ?? true
        }
      >
        <MonthGrid
          current={field.current}
          focused={field.focused}
          onFocusedChange={field.handleFocusedChange}
          onChoose={field.handleChoose}
          bounds={{ max, min }}
          gridId={gridId}
        />
      </PopoverContent>
    </Popover>
  );
}

export { MonthPicker };
export type { MonthPickerProps };
