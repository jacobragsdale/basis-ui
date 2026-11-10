/* What a typed filter shows while the user types, ahead of the address: text, or a range's two numbers. The draft goes
 * to the address once typing pauses, or at once on Enter or on leaving the field, so the rows are not filtered again at
 * every key. The first write after the field takes the focus adds a history entry, and the rest until the focus leaves
 * it, or the group of fields it is in, replace that entry, so Back undoes the typing in one step, never a key at a
 * time. When the address changes from elsewhere, by Back, a chip's clear or a saved view, the draft takes its value,
 * and the next write adds an entry rather than replacing the one Back went to. */

import { useEffect, useRef, useState } from "react";
import type { Dispatch, FocusEvent, KeyboardEvent, SetStateAction } from "react";

/** How long typing pauses before the draft goes to the address, in milliseconds. */
const typingPause = 300;

interface DraftOptions<TDraft> {
  /** The value the address holds, as a draft. */
  readonly value: TDraft;
  /** Writes a draft to the address, replacing the current history entry when `replace` is true; returns whether it
   * wrote, since a draft that reads as no value, such as half-typed number, is not written. */
  readonly commit: (draft: TDraft, replace: boolean) => boolean;
  /** Whether two drafts hold the same value. */
  readonly same: (left: TDraft, right: TDraft) => boolean;
}

/** The handlers of the element round the field, or fields, that the draft is typed in. */
interface DraftGroup {
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

interface Draft<TDraft> {
  /** What the field shows. */
  readonly draft: TDraft;
  /** Takes what the user typed, and writes it to the address once typing pauses. */
  readonly change: (next: TDraft) => void;
  readonly group: DraftGroup;
}

interface DraftState<TDraft> {
  readonly draft: TDraft;
  /** The address's value as the field last saw it. */
  readonly seen: TDraft;
  /** The draft last written, until the address holds it. */
  readonly written: { readonly value: TDraft } | null;
  /** Whether the address moved from elsewhere since this field last wrote. */
  readonly moved: boolean;
}

/** The draft and the address's value as the field last saw it. When the address moves to what this field wrote, the
 * draft stays, since the user may have typed on; when it moves from elsewhere, the draft takes its value. */
function useDraftState<TDraft>(
  value: TDraft,
  same: (left: TDraft, right: TDraft) => boolean,
): readonly [DraftState<TDraft>, Dispatch<SetStateAction<DraftState<TDraft>>>] {
  const [state, setState] = useState<DraftState<TDraft>>({
    draft: value,
    moved: false,
    seen: value,
    written: null,
  });
  if (!same(value, state.seen)) {
    const ours = state.written !== null && same(value, state.written.value);
    setState({ draft: ours ? state.draft : value, moved: !ours, seen: value, written: null });
  }
  return [state, setState];
}

/** Writes a draft once typing pauses, or at once when flushed: the first write of each use of the field adds a history
 * entry and the rest replace it, until `leave` ends the use. */
function usePausedWrite<TDraft>(write: (next: TDraft, replace: boolean) => boolean): {
  readonly schedule: (next: TDraft) => void;
  readonly flush: (draft: TDraft) => void;
  readonly leave: (draft: TDraft) => void;
} {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Whether this use of the field has added its history entry yet.
  const pushed = useRef(false);
  useEffect(
    () => (): void => {
      clearTimeout(timer.current);
    },
    [],
  );
  const send = (next: TDraft): void => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (write(next, pushed.current)) {
      pushed.current = true;
    }
  };
  return {
    flush: (draft) => {
      if (timer.current !== undefined) {
        send(draft);
      }
    },
    leave: (draft) => {
      if (timer.current !== undefined) {
        send(draft);
      }
      pushed.current = false;
    },
    schedule: (next) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        send(next);
      }, typingPause);
    },
  };
}

/** A typed filter's draft, written to the address as typing pauses, one history entry each time the field is used. */
function useFilterDraft<TDraft>({ value, commit, same }: DraftOptions<TDraft>): Draft<TDraft> {
  const [state, setState] = useDraftState(value, same);
  const writer = usePausedWrite<TDraft>((next, replace) => {
    if (same(next, value) || !commit(next, replace && !state.moved)) {
      return false;
    }
    setState((current) => ({ ...current, moved: false, written: { value: next } }));
    return true;
  });
  return {
    change: (next) => {
      setState((current) => ({ ...current, draft: next }));
      writer.schedule(next);
    },
    draft: state.draft,
    group: {
      onBlur: (event) => {
        const to = event.relatedTarget;
        if (!(to instanceof Node && event.currentTarget.contains(to))) {
          writer.leave(state.draft);
        }
      },
      onKeyDown: (event) => {
        if (event.key === "Enter") {
          writer.flush(state.draft);
        }
      },
    },
  };
}

export { typingPause, useFilterDraft };
export type { Draft, DraftGroup };
