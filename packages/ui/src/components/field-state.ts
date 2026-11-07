/* What the numbers and dates fields share: a value that is controlled when the app passes one and the field's own
 * otherwise, a popover's month grid with the day it focuses, today held still while the page is open, and the ids an
 * `aria-describedby` names. */

import { useId, useMemo, useState } from "react";

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

/** Today, as the app sets it or as it was in New York when the field mounted, so it holds still while the page is
 * open. */
function useToday(today: Temporal.PlainDate | undefined): Temporal.PlainDate {
  const mountedOn = useMemo(() => todayInNewYork(), []);
  return today ?? mountedOn;
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

function useGridPopover(start: () => Temporal.PlainDate): GridPopover {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(start);
  const tableId = useId();
  return {
    close: () => {
      setOpen(false);
    },
    focused,
    handleFocusedChange: setFocused,
    handleOpenChange: (next) => {
      if (next) {
        setFocused(start());
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
export type { GridPopover };
