/* The error toast: what `BasisApp` raises for a failed mutation, in the words `describeError` gives. The same error
 * again soon after, while its toast is open, counts on that toast rather than raising another, so a save clicked
 * five times or a poll failing every few seconds shows one toast that says how often. */

import type { ReactElement } from "react";

import { toast } from "#components/toast-manager.ts";

import { describeError, fieldLine } from "./describe-error.ts";

/** How long after an error the same one counts on its toast, in milliseconds, if the toast is still open. */
const repeatWindowMs = 10_000;

/** An error toast that is open: its id, how many times its error has been raised, and when it was last. */
interface Raised {
  readonly id: string;
  readonly count: number;
  readonly at: number;
}

/** Who hears of each error as its toast is raised: `checkRoutes` in `@basis/ui/testing`, which fails a route that
 * raises one. */
const errorToastListeners = new Set<(error: unknown) => void>();

/** Hears of each error `toastError` raises a toast for, until the returned function is called. */
function onErrorToast(listener: (error: unknown) => void): () => void {
  errorToastListeners.add(listener);
  return () => {
    errorToastListeners.delete(listener);
  };
}

/** The open error toasts, by what they say. */
const raised = new Map<string, Raised>();

/** The open toast of the error that `key` names, if it was raised within the window before `now`. */
function repeated(key: string, now: number): Raised | undefined {
  const last = raised.get(key);
  return last !== undefined && now - last.at <= repeatWindowMs ? last : undefined;
}

/** A toast's lines, each a line of its own, and how many times it was raised when more than once. */
function describe(lines: readonly string[], count: number): ReactElement {
  const shown = count > 1 ? [...lines, `This happened ${String(count)} times.`] : lines;
  return (
    <>
      {shown.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </>
  );
}

/** Raises the toast `toastError` describes. */
function raiseToast(error: unknown): string {
  const { title, detail, fields, reference } = describeError(error);
  const said = [
    ...(detail === undefined ? [] : [detail]),
    ...new Set(fields.map((field) => fieldLine(field))),
  ];
  const lines = [...said, ...(reference === undefined ? [] : [`Reference ${reference}`])];
  const key = JSON.stringify([title, ...said]);
  const now = Date.now();
  const last = repeated(key, now);
  const count = (last?.count ?? 0) + 1;
  const id = toast.add({
    description: describe(lines, count),
    // The same id updates the open toast in place; a toast already gone, as with its Toaster, is raised again.
    ...(last === undefined ? {} : { id: last.id }),
    onClose: () => {
      if (raised.get(key)?.id === id) {
        raised.delete(key);
      }
    },
    priority: "high",
    timeout: 0,
    title,
    type: "error",
  });
  raised.set(key, { at: now, count, id });
  return id;
}

/** Raises a toast for `error`, such as a failed save, and returns its id: the problem's title, then its detail, each
 * field a 422 names and the request's reference, a line each. `BasisApp` raises one for every failed mutation unless
 * the mutation's `meta` says `{ errorToast: false }`. The toast stays until the user closes it, and a screen reader
 * announces it at once.
 *
 * The same error, its title, detail and fields alike, raised again within 10 seconds of the last while its toast is
 * open, raises no new toast: that one shows the latest reference and how many times it happened, and its id is
 * returned. Once the toast is closed, the error raises a new one. */
function toastError(error: unknown): string {
  for (const listener of errorToastListeners) {
    listener(error);
  }
  return raiseToast(error);
}

export { onErrorToast, toastError };
