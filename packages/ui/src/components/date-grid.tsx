/* DateGrid: the month grid the date pickers open, on the WAI-ARIA date picker dialog pattern. It is a `grid` table
 * labelled by its month, which is a polite live region, so a screen reader hears the month change. One day button is
 * in the tab order at a time; the arrows, Home, End, PageUp and PageDown move it (date-grid-keys.ts), Enter or Space
 * picks it, and Escape closes the popover around it. Focus may rest on a day that cannot be picked, so the keys pass
 * over weekends and holidays, but such a day is `aria-disabled` and picking it does nothing.
 *
 * Each day is marked by the field's calendar: a day the market is closed is muted, a holiday also struck through, and
 * an early close carries a dot. Each day's name, and its title, give the reason, and the line under the grid gives
 * the focused day's, so the mark is never the only telling of it. A day's hover shows at once, as a table row's does,
 * since the pointer crosses many of them. */

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactElement } from "react";

import type { MarketDay } from "#dates/calendar.ts";
import type { DateRange } from "#dates/periods.ts";
import { ChevronLeftIcon } from "#vendor/lucide/chevron-left.tsx";
import { ChevronRightIcon } from "#vendor/lucide/chevron-right.tsx";
import { ChevronsLeftIcon } from "#vendor/lucide/chevrons-left.tsx";
import { ChevronsRightIcon } from "#vendor/lucide/chevrons-right.tsx";
import { Button } from "./button.tsx";
import {
  clampDate,
  monthInRange,
  monthWeeks,
  movedDate,
  weekdays,
  within,
} from "./date-grid-keys.ts";
import { dayLabel, marketNote, monthText, whyNotPickable } from "./date-picking.ts";
import type { PickRules } from "./date-picking.ts";

interface DateGridProps {
  /** The day in the tab order, whose month the grid shows. */
  readonly focused: Temporal.PlainDate;
  readonly onFocusedChange: (date: Temporal.PlainDate) => void;
  /** The days shown as picked: one day as a range of one, or a range. */
  readonly selection: DateRange | undefined;
  /** Called with a day that can be picked, when it is clicked or chosen with Enter or Space. */
  readonly onPick: (date: Temporal.PlainDate) => void;
  readonly rules: PickRules;
  readonly today: Temporal.PlainDate;
  /** The id of the grid's table, through which a popover finds the day to focus first. */
  readonly tableId: string;
}

/** How a day trades, for its mark: a weekend, another closed day, an early close, or a regular session. */
function marketOf(day: MarketDay): "weekend" | "holiday" | "early-close" | "open" {
  if (day.kind === "closed") {
    return day.reason === "Weekend" ? "weekend" : "holiday";
  }
  return day.kind;
}

/** A note as a title: its first letter in capitals. */
function titleOf(note: string | undefined): string | undefined {
  return note === undefined ? undefined : `${note.charAt(0).toUpperCase()}${note.slice(1)}`;
}

/** Whether `date` is an end of the selection, or inside it. */
function placeIn(
  date: Temporal.PlainDate,
  selection: DateRange | undefined,
): "edge" | "inside" | undefined {
  if (selection === undefined || !within(date, selection.start, selection.end)) {
    return undefined;
  }
  return date.equals(selection.start) || date.equals(selection.end) ? "edge" : "inside";
}

interface DayProps {
  readonly date: Temporal.PlainDate;
  readonly grid: DateGridProps;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/** One day's cell, holding its button. */
function Day({ date, grid, onKeyDown }: DayProps): ReactElement {
  const day = grid.rules.calendar.day(date);
  const pickable = whyNotPickable(date, grid.rules) === undefined;
  const place = placeIn(date, grid.selection);
  return (
    <td aria-selected={place === "edge"} className="p-0">
      <button
        type="button"
        tabIndex={date.equals(grid.focused) ? 0 : -1}
        data-date={date.toString()}
        aria-disabled={pickable ? undefined : true}
        aria-label={dayLabel(date, day)}
        aria-current={date.equals(grid.today) ? "date" : undefined}
        title={titleOf(marketNote(day))}
        data-market={marketOf(day)}
        data-selected={place === "edge"}
        data-in-range={place === "inside"}
        className="relative flex size-8 items-center justify-center rounded-md text-sm tabular-nums outline-none hover:bg-muted focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring aria-disabled:cursor-default aria-disabled:text-muted-foreground aria-disabled:hover:bg-transparent aria-[current=date]:font-semibold aria-[current=date]:underline aria-[current=date]:underline-offset-4 data-[in-range=true]:bg-accent data-[in-range=true]:text-accent-foreground data-[market=early-close]:after:absolute data-[market=early-close]:after:bottom-1 data-[market=early-close]:after:left-1/2 data-[market=early-close]:after:size-1 data-[market=early-close]:after:-translate-x-1/2 data-[market=early-close]:after:rounded-full data-[market=early-close]:after:bg-warning data-[market=holiday]:line-through data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:hover:bg-primary-hover"
        onClick={() => {
          grid.onFocusedChange(date);
          if (pickable) {
            grid.onPick(date);
          }
        }}
        onKeyDown={onKeyDown}
      >
        {date.day}
      </button>
    </td>
  );
}

interface MonthStepProps {
  readonly label: string;
  readonly to: Temporal.PlainDate;
  readonly grid: DateGridProps;
  readonly children: ReactElement;
}

/** A button that shows another month, or year, focusing the same day there; disabled when that month lies wholly
 * outside the field's dates. Focus stays on the button, as the pattern has it. */
function MonthStep({ label, to, grid, children }: MonthStepProps): ReactElement {
  const { max, min } = grid.rules;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={!monthInRange(to, min, max)}
      onClick={() => {
        grid.onFocusedChange(clampDate(to, min, max));
      }}
    >
      {children}
    </Button>
  );
}

/** The month's name between the buttons that step a year or a month either way. The name is a polite live region,
 * so a screen reader hears the month change. */
function GridHeader({
  grid,
  headingId,
}: {
  readonly grid: DateGridProps;
  readonly headingId: string;
}): ReactElement {
  const { focused } = grid;
  return (
    <div className="flex items-center gap-1">
      <MonthStep label="Previous year" to={focused.subtract({ years: 1 })} grid={grid}>
        <ChevronsLeftIcon />
      </MonthStep>
      <MonthStep label="Previous month" to={focused.subtract({ months: 1 })} grid={grid}>
        <ChevronLeftIcon />
      </MonthStep>
      <p id={headingId} aria-live="polite" className="flex-1 text-center text-sm font-medium">
        {monthText(focused)}
      </p>
      <MonthStep label="Next month" to={focused.add({ months: 1 })} grid={grid}>
        <ChevronRightIcon />
      </MonthStep>
      <MonthStep label="Next year" to={focused.add({ years: 1 })} grid={grid}>
        <ChevronsRightIcon />
      </MonthStep>
    </div>
  );
}

/** The focused day's market note, and the key to the marks. */
function GridKey({ grid }: { readonly grid: DateGridProps }): ReactElement {
  return (
    <>
      <p data-slot="date-grid-note" className="h-4 text-xs text-muted-foreground">
        {titleOf(marketNote(grid.rules.calendar.day(grid.focused)))}
      </p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
          Early close
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="line-through">
            11
          </span>
          Holiday
        </span>
      </div>
    </>
  );
}

/** The keys that move focus through the grid. A move marks `moved`, so the day it lands on takes focus once it is
 * drawn, in whatever month. */
function useGridKeys(grid: DateGridProps): (event: KeyboardEvent<HTMLButtonElement>) => void {
  const { focused, onFocusedChange, rules, tableId } = grid;
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) {
      moved.current = false;
      document
        .querySelector<HTMLElement>(`#${CSS.escape(tableId)} [data-date="${focused.toString()}"]`)
        ?.focus();
    }
  }, [focused, tableId]);
  return (event) => {
    const next = movedDate(focused, event.key, event.shiftKey);
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    const landed = clampDate(next, rules.min, rules.max);
    // A key that moves nothing, as at the latest date, draws nothing, so it leaves no move waiting for a later draw.
    if (!landed.equals(focused)) {
      moved.current = true;
      onFocusedChange(landed);
    }
  };
}

/** The month grid with its month and year buttons, the focused day's note, and the key to its marks. */
function DateGrid(grid: DateGridProps): ReactElement {
  const { focused, tableId } = grid;
  const headingId = useId();
  const onKeyDown = useGridKeys(grid);
  const month = focused.toPlainYearMonth().toString();
  return (
    <div data-slot="date-grid" className="flex flex-col gap-2">
      <GridHeader grid={grid} headingId={headingId} />
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role -- the WAI-ARIA date picker dialog pattern makes the month's table a grid, which takes the arrow keys. */}
      <table id={tableId} role="grid" aria-labelledby={headingId} className="border-collapse">
        <thead>
          <tr>
            {weekdays.map(([short, full]) => (
              <th
                key={full}
                scope="col"
                abbr={full}
                className="size-8 p-0 text-xs font-normal text-muted-foreground"
              >
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(focused).map((week, row) => (
            <tr key={`${month}-${String(row)}`}>
              {week.map((date, column) =>
                date === undefined ? (
                  // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- a blank cell before the 1st or after the month's last day holds its weekday's column, as in the pattern's own example; it is not a control.
                  <td key={`blank-${String(column)}`} className="p-0" />
                ) : (
                  <Day key={date.toString()} date={date} grid={grid} onKeyDown={onKeyDown} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <GridKey grid={grid} />
    </div>
  );
}

export { DateGrid };
