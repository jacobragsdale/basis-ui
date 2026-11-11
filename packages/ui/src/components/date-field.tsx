/* The single-date field AsOfDatePicker and DatePicker share: a text input, which takes a typed `2026-11-06` or
 * `11/06/2026` when the person leaves it or presses Enter, beside a button that opens a month grid in a popover, on
 * Temporal and `@basis/ui/dates` (date-grid.tsx has the grid's keys). Each picker gives it its rules, the value an
 * uncontrolled field starts at and the month its grid opens on.
 *
 * A typed date the field cannot take leaves the value `null` and says why, as the field's error: not a date, before or
 * after the field's dates, or a day the market is closed, naming the holiday, where the field takes business days
 * only. The field draws its error line, so a form passes it the field's errors rather than drawing a FieldError of its
 * own. The input and the error line stack in a column of their own, so a horizontal Field sets the column beside its
 * label. */

import { useId, useState } from "react";
import type { ComponentProps, FocusEvent, KeyboardEvent, ReactElement } from "react";

import type { Calendar } from "#dates/calendar.ts";
import { CalendarIcon } from "#vendor/lucide/calendar.tsx";

import { DateGrid } from "./date-grid.tsx";
import { readDate, sameDate, whyNotPickable } from "./date-picking.ts";
import type { PickRules } from "./date-picking.ts";
import { idList, useControlled, useGridPopover, useToday } from "./field-state.ts";
import type { GridPopover } from "./field-state.ts";
import { FieldError } from "./field.tsx";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

type FieldErrors = NonNullable<ComponentProps<typeof FieldError>["errors"]>;

interface DateFieldProps extends Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "children"
> {
  /** The date, or `null` for none. Leave it out for an uncontrolled field. */
  readonly value?: Temporal.PlainDate | null | undefined;
  /** The date an uncontrolled field starts at. */
  readonly defaultValue?: Temporal.PlainDate | null | undefined;
  /** Called with the date when one is picked or typed, and with `null` when the field is cleared or what was typed
   * cannot be taken. */
  readonly onValueChange?: ((value: Temporal.PlainDate | null) => void) | undefined;
  /** The calendar whose business days the field takes; SIFMA's unless set. */
  readonly calendar?: Calendar | undefined;
  /** The earliest date the field takes; none unless set. */
  readonly min?: Temporal.PlainDate | undefined;
  /** The latest date the field takes; none when `null`. */
  readonly max?: Temporal.PlainDate | null | undefined;
  /** Today, which the default value and the latest date count from; today in New York unless set. */
  readonly today?: Temporal.PlainDate | undefined;
  /** The form's errors for the field, such as TanStack Form's `field.state.meta.errors`, shown under the input. */
  readonly errors?: FieldErrors | undefined;
  /** The name of the button that opens the grid, and of the grid's dialog; "Choose a date" unless set. */
  readonly pickerLabel?: string | undefined;
}

/** What a picker gives the field: its rules, the value an uncontrolled field starts at when it sets none, and the date
 * its grid opens on while it has no value, each from today. */
interface DateFieldBehaviour {
  readonly rulesFor: (
    props: Pick<DateFieldProps, "calendar" | "min" | "max">,
    today: Temporal.PlainDate,
  ) => PickRules;
  readonly initialFor: (
    calendar: Calendar | undefined,
    today: Temporal.PlainDate,
  ) => Temporal.PlainDate | null;
  readonly startFor: (
    calendar: Calendar | undefined,
    today: Temporal.PlainDate,
  ) => Temporal.PlainDate;
}

/** What was typed and not yet taken, with the value it was typed over and, once committed, why it cannot be taken. */
interface Draft {
  readonly text: string;
  readonly over: Temporal.PlainDate | null;
  readonly reason: string | undefined;
}

/** What a typed text gives: a date, `null` for an empty field, or the reason it cannot be taken. */
function takeText(
  text: string,
  rules: PickRules,
): { readonly date: Temporal.PlainDate | null; readonly reason: string | undefined } {
  if (text.trim() === "") {
    return { date: null, reason: undefined };
  }
  const reading = readDate(text);
  if (!reading.ok) {
    return { date: null, reason: reading.reason };
  }
  const reason = whyNotPickable(reading.value, rules);
  return { date: reason === undefined ? reading.value : null, reason };
}

interface TypedDate {
  readonly text: string;
  readonly reason: string | undefined;
  readonly type: (text: string) => void;
  /** Takes what was typed, as the field is left or Enter pressed. */
  readonly commit: () => void;
  readonly clear: () => void;
}

/** The text the field shows: what was typed while the value is still the one it was typed over, and otherwise the
 * value. A value set from outside replaces the draft, and its reason with it. */
function useTypedDate(
  current: Temporal.PlainDate | null,
  change: (next: Temporal.PlainDate | null) => void,
  rulesNow: () => PickRules,
): TypedDate {
  const [draft, setDraft] = useState<Draft | null>(null);
  const live = draft !== null && sameDate(draft.over, current) ? draft : null;
  return {
    clear: () => {
      setDraft(null);
    },
    commit: () => {
      if (live === null || live.reason !== undefined) {
        return;
      }
      const taken = takeText(live.text, rulesNow());
      setDraft(taken.reason === undefined ? null : { ...live, over: null, reason: taken.reason });
      change(taken.date);
    },
    reason: live?.reason,
    text: live === null ? (current?.toString() ?? "") : live.text,
    type: (text) => {
      setDraft({ over: current, reason: undefined, text });
    },
  };
}

interface DatePopoverProps {
  readonly label: string;
  readonly popover: GridPopover;
  readonly current: Temporal.PlainDate | null;
  readonly rules: PickRules;
  readonly today: Temporal.PlainDate;
  readonly onPick: (date: Temporal.PlainDate) => void;
}

/** The calendar button inside the input, and the popover with the month grid it opens. */
function DatePopover({
  label,
  popover,
  current,
  rules,
  today,
  onPick,
}: DatePopoverProps): ReactElement {
  return (
    <Popover open={popover.open} modal="trap-focus" onOpenChange={popover.handleOpenChange}>
      <PopoverTrigger aria-label={label} render={<InputGroupButton size="icon-xs" />}>
        <CalendarIcon />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={label}
        className="w-auto"
        initialFocus={popover.initialFocus}
      >
        <DateGrid
          focused={popover.focused}
          onFocusedChange={popover.handleFocusedChange}
          selection={current === null ? undefined : { end: current, start: current }}
          onPick={onPick}
          rules={rules}
          today={today}
          tableId={popover.tableId}
        />
      </PopoverContent>
    </Popover>
  );
}

type FieldProps = Omit<DateFieldProps, "className" | "errors" | "pickerLabel">;

/** The props of the field's input: the app's, then the typed text and the handlers that commit it. */
function inputPropsOf(
  typed: TypedDate,
  inputId: string,
  {
    onBlur,
    onKeyDown,
    "aria-describedby": describedBy,
    "aria-invalid": ariaInvalid,
    ...props
  }: Omit<
    FieldProps,
    "id" | "value" | "defaultValue" | "onValueChange" | "calendar" | "min" | "max" | "today"
  >,
): ComponentProps<"input"> {
  return {
    autoComplete: "off",
    placeholder: "YYYY-MM-DD",
    spellCheck: false,
    ...props,
    "aria-describedby": idList(`${inputId}-error`, describedBy),
    "aria-invalid": typed.reason === undefined ? ariaInvalid : true,
    id: inputId,
    onBlur: (event: FocusEvent<HTMLInputElement>) => {
      typed.commit();
      onBlur?.(event);
    },
    onChange: (event) => {
      typed.type(event.target.value);
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        typed.commit();
      }
      onKeyDown?.(event);
    },
    value: typed.text,
  };
}

/** The field's state: its value, what was typed, and the popover's grid, with the props its parts take. */
function useDateField(
  { id, value, defaultValue, onValueChange, calendar, min, max, today, ...props }: FieldProps,
  { rulesFor, initialFor, startFor }: DateFieldBehaviour,
): {
  readonly input: ComponentProps<"input">;
  readonly popover: Omit<DatePopoverProps, "label">;
  readonly errorId: string;
  readonly reason: string | undefined;
} {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const now = useToday(today);
  const { day } = now;
  const bounds = { calendar, max, min };
  const rules = rulesFor(bounds, day);
  const [current, change] = useControlled({
    initial: () => (defaultValue === undefined ? initialFor(calendar, day) : defaultValue),
    onChange: onValueChange,
    same: sameDate,
    value,
  });
  const typed = useTypedDate(current, change, () => rulesFor(bounds, now.refresh()));
  const popover = useGridPopover((from) => current ?? startFor(calendar, from), now);
  return {
    errorId: `${inputId}-error`,
    input: inputPropsOf(typed, inputId, props),
    popover: {
      current,
      onPick: (date) => {
        typed.clear();
        change(date);
        popover.close();
      },
      popover,
      rules,
      today: day,
    },
    reason: typed.reason,
  };
}

/** A single-date field with a picker's behaviour: AsOfDatePicker's or DatePicker's. */
function DateField({
  className,
  errors,
  pickerLabel = "Choose a date",
  behaviour,
  ...props
}: DateFieldProps & { readonly behaviour: DateFieldBehaviour }): ReactElement {
  const field = useDateField(props, behaviour);
  return (
    <div data-slot="field-content" className="flex min-w-0 flex-1 flex-col gap-2">
      <InputGroup className={className}>
        <InputGroupInput {...field.input} />
        <InputGroupAddon align="inline-end">
          <DatePopover label={pickerLabel} {...field.popover} />
        </InputGroupAddon>
      </InputGroup>
      <FieldError
        id={field.errorId}
        errors={field.reason === undefined ? errors : [field.reason]}
      />
    </div>
  );
}

export { DateField };
export type { DateFieldBehaviour, DateFieldProps };
