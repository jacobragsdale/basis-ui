/* What a single-date field shows while a date is typed: the text, until it is taken as the field is left or Enter
 * pressed, and once refused, the text and why, as long as `isLive` says. A value set from outside replaces both. */

import { useState } from "react";

import { readDate, sameDate, whyNotPickable } from "./date-picking.ts";
import type { PickRules } from "./date-picking.ts";

/** What was typed and not yet taken, with the value it was typed over and, once committed, why it cannot be taken,
 * and whether the value has since been `null`, as the refusal reported it. */
interface Draft {
  readonly text: string;
  readonly over: Temporal.PlainDate | null;
  readonly reason: string | undefined;
  readonly taken: boolean;
}

/** Whether the field still shows a draft. Typing shows while the value is the one typed over. A refused date shows
 * while the value is `null`, as the refusal reported it, or, until the value has once been `null`, still the one it
 * was typed over: so a parent that ignores `null` keeps the refused text and its reason, and a value set from outside
 * replaces them. */
function isLive(draft: Draft, current: Temporal.PlainDate | null): boolean {
  if (draft.reason === undefined) {
    return sameDate(draft.over, current);
  }
  return current === null || (!draft.taken && sameDate(draft.over, current));
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
  if (draft?.reason !== undefined && !draft.taken && current === null) {
    setDraft({ ...draft, taken: true });
  }
  const live = draft !== null && isLive(draft, current) ? draft : null;
  return {
    clear: () => {
      setDraft(null);
    },
    commit: () => {
      if (live === null || live.reason !== undefined) {
        return;
      }
      const taken = takeText(live.text, rulesNow());
      setDraft(taken.reason === undefined ? null : { ...live, reason: taken.reason });
      change(taken.date);
    },
    reason: live?.reason,
    text: live === null ? (current?.toString() ?? "") : live.text,
    type: (text) => {
      setDraft({ over: current, reason: undefined, taken: false, text });
    },
  };
}

export { useTypedDate };
export type { TypedDate };
