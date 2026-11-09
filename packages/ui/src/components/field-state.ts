/* What the numbers and dates fields share: a value that is controlled when the app passes one and the field's own
 * otherwise, a popover's month grid with the day it focuses, today held still between the field's looks at it, and the
 * ids an `aria-describedby` names. */

import { useId, useState } from "react";

import { todayInNewYork } from "./date-picking.ts";

interface Controlled<TValue> {
  /** The app's value, or `undefined` while the field keeps its own. */
  readonly value: TValue | undefined;
  /** The field's own value as it mounts. */
  readonly initial: () => TValue;
  readonly onChange: ((next: TValue) => void) | undefined;
  /** Whether two values are the same, so the app hears of a change once. */
  readonly same: (left: TValue, right: TValue) => boolean;
}

/** A field's value: the app's while it passes one (anything but `undefined`), and the field's own otherwise. `change`
 * sets the field's own and tells the app, once, when the value changes. */
function useControlled<TValue>({
  value,
  initial,
  onChange,
  same,
}: Controlled<TValue>): readonly [TValue, (next: TValue) => void] {
  const [own, setOwn] = useState(initial);
  let current = own;
  if (value !== undefined) {
    current = value;
  }
  const change = (next: TValue): void => {
    if (value === undefined) {
      setOwn(next);
    }
    if (!same(next, current)) {
      onChange?.(next);
    }
  };
  return [current, change];
}

/** Today as a field counts from it: the app's, or New York's as of the field's last look. */
interface Today {
  readonly day: Temporal.PlainDate;
  /** Looks again, as a picker opens or a typed date is taken, so a page left open past midnight moves on with the
   * date; returns the day it found. */
  readonly refresh: () => Temporal.PlainDate;
}

/** Today, as the app sets it or as it was in New York when the field last looked: as it mounted, and again each time
 * `refresh` is called. It holds still in between, so the field does not change under the user's hand. */
function useToday(today: Temporal.PlainDate | undefined): Today {
  const [seen, setSeen] = useState(todayInNewYork);
  return {
    day: today ?? seen,
    refresh: () => {
      if (today !== undefined) {
        return today;
      }
      const now = todayInNewYork();
      if (!now.equals(seen)) {
        setSeen(now);
      }
      return now;
    },
  };
}

/** A popover holding a month grid: whether it is open, the day the grid focuses, and the id of the grid's table,
 * through which the popover moves focus to that day as it opens. */
interface GridPopover {
  readonly open: boolean;
  readonly focused: Temporal.PlainDate;
  readonly handleFocusedChange: (date: Temporal.PlainDate) => void;
  readonly tableId: string;
  /** For the popover's `onOpenChange`: opening focuses the day `start` gives. */
  readonly handleOpenChange: (open: boolean) => void;
  /** For the popup's `initialFocus`: the grid's focused day. */
  readonly initialFocus: () => HTMLElement | true;
  readonly close: () => void;
}

/** The grid's popover, which focuses the day `start` gives as it opens, from today as `today` finds it then. */
function useGridPopover(
  start: (today: Temporal.PlainDate) => Temporal.PlainDate,
  today: Today,
): GridPopover {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(() => start(today.day));
  const tableId = useId();
  return {
    close: () => {
      setOpen(false);
    },
    focused,
    handleFocusedChange: setFocused,
    handleOpenChange: (next) => {
      if (next) {
        setFocused(start(today.refresh()));
      }
      setOpen(next);
    },
    initialFocus: () =>
      document.querySelector<HTMLElement>(`#${CSS.escape(tableId)} [tabindex="0"]`) ?? true,
    open,
    tableId,
  };
}

/** The ids an `aria-describedby` names, leaving out those that are unset. */
function idList(...ids: readonly (string | undefined)[]): string {
  return ids.filter((name) => name !== undefined && name !== "").join(" ");
}

export { idList, useControlled, useGridPopover, useToday };
export type { GridPopover, Today };
