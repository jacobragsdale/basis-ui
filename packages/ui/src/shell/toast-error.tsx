/* The error toast: what `BasisApp` raises for a failed mutation, in the words `describeError` gives. */

import { toast } from "#components/toast-manager.ts";

import { describeError, fieldLine } from "./describe-error.ts";

/** Raises a toast for `error`, such as a failed save, and returns its id: the problem's title, then its detail, each
 * field a 422 names and the request's reference, a line each. `BasisApp` raises one for every failed mutation unless
 * the mutation's `meta` says `{ errorToast: false }`. The toast stays until the user closes it, and a screen reader
 * announces it at once. */
function toastError(error: unknown): string {
  const { title, detail, fields, reference } = describeError(error);
  const lines = [
    ...(detail === undefined ? [] : [detail]),
    ...new Set(fields.map((field) => fieldLine(field))),
    ...(reference === undefined ? [] : [`Reference ${reference}`]),
  ];
  return toast.add({
    description: (
      <>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </>
    ),
    priority: "high",
    timeout: 0,
    title,
    type: "error",
  });
}

export { toastError };
