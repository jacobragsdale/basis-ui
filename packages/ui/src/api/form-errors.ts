/* What a failed submit leaves on a form on TanStack Form: a 422's errors on the fields they name, or, for a failure
 * the fields cannot hold, a form error, so the submit fails and the page shows the error itself. A form's
 * `onSubmitAsync` returns it; each field's errors then show under it, as the schema's do. */

import { isApiError } from "./fetch.ts";
import { fieldErrors } from "./problem.ts";

/** The status of a request the API refused, whose problem names each field at fault. */
const unprocessableContent = 422;

/** What `onSubmitAsync` returns for a failure: a form error's text, or the errors of the fields a 422 names. */
type SubmitErrors = string | { readonly fields: Record<string, readonly string[]> };

/** A 422's errors by the field each names, or `undefined` when the form's fields cannot hold the failure: any failure
 * but a 422, a 422 that names no field, and one that names a field the form does not have. */
function errorsOnFields(
  error: unknown,
  fields: ReadonlySet<string> | readonly string[],
): Record<string, readonly string[]> | undefined {
  if (!isApiError(error) || error.status !== unprocessableContent) {
    return undefined;
  }
  const known = new Set(fields);
  const named = [...fieldErrors(error.problem)];
  return named.length > 0 && named.every(([name]) => known.has(name))
    ? Object.fromEntries(named)
    : undefined;
}

/** What a failed submit leaves on the form: the errors of the fields a 422 names, or `message`, a form error, for a
 * failure they cannot hold, which the page shows with ErrorAlert. */
function submitErrors(
  error: unknown,
  {
    fields,
    message,
  }: { readonly fields: ReadonlySet<string> | readonly string[]; readonly message: string },
): SubmitErrors {
  const named = errorsOnFields(error, fields);
  return named === undefined ? message : { fields: named };
}

export { errorsOnFields, submitErrors };
export type { SubmitErrors };
