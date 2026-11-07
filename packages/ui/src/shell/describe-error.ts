/* What the app shell tells the user about an error: the words `ErrorAlert` and `toastError` show, read from the
 * problem details a basis API answers (RFC 9457, as basis's contract promises every error is), or from the kind of
 * failure when the API answered nothing the client could read. */

import { isApiError } from "#api/fetch.ts";
import { fieldErrors } from "#api/problem.ts";

/** One field's error, by the field's name as TanStack Form gives it, such as `legs[0].price`; `""` is the whole
 * request. */
interface FieldProblem {
  readonly field: string;
  readonly detail: string;
}

/** An error, in the user's words. */
interface ErrorDescription {
  /** What went wrong, the same words every time for the same kind of problem. */
  readonly title: string;
  /** What happened this time, when the API said. */
  readonly detail?: string;
  /** Each field a 422 named, in its order. */
  readonly fields: readonly FieldProblem[];
  /** The request's id, which the API's logs carry, for the user to quote to support. */
  readonly reference?: string;
}

const unauthorized = 401;
const forbidden = 403;
const notFound = 404;

/** Titles for a problem that has none, by its status. */
const titlesByStatus = new Map([
  [unauthorized, "Sign in to see this"],
  [forbidden, "You do not have access to this"],
  [notFound, "Not found"],
]);

function titleForStatus(status: number): string {
  return titlesByStatus.get(status) ?? `The request failed with status ${String(status)}`;
}

/** The words for `error`: problem details when the API answered them, otherwise the kind of failure. */
function describeError(error: unknown): ErrorDescription {
  if (isApiError(error)) {
    const { problem } = error;
    const fields = [...fieldErrors(problem)].flatMap(([field, details]) =>
      details.map((detail) => ({ detail, field })),
    );
    const reference = problem.instance?.replace(/^urn:uuid:/u, "");
    return {
      fields,
      title: problem.title ?? titleForStatus(error.status),
      ...(problem.detail === undefined || problem.detail === null
        ? {}
        : { detail: problem.detail }),
      ...(reference === undefined ? {} : { reference }),
    };
  }
  if (error instanceof Error && error.name === "ZodError") {
    return {
      detail:
        "The API may have changed since this page was built. Reload the page, and tell support if it happens again.",
      fields: [],
      title: "The response was not in the form this page expects",
    };
  }
  if (error instanceof TypeError) {
    return {
      detail: "Check the network connection, then try again.",
      fields: [],
      title: "The server could not be reached",
    };
  }
  return {
    fields: [],
    title: "Something went wrong",
    ...(error instanceof Error && error.message !== "" ? { detail: error.message } : {}),
  };
}

/** One line of a field error, naming its field unless it is the whole request's. */
function fieldLine({ field, detail }: FieldProblem): string {
  return field === "" ? detail : `${field}: ${detail}`;
}

export { describeError, fieldLine };
export type { ErrorDescription, FieldProblem };
