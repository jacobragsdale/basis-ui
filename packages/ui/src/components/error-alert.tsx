/* ErrorAlert: a failed query's or mutation's error, on a destructive Alert. It reads the problem details a basis API
 * answers (RFC 9457): the problem's title as the alert's, its detail, each field a 422 names, and the request's id for
 * support. A failure the API did not answer, such as a lost connection or a response its schema refused, gets words
 * of its own. It renders nothing while there is no error, so it sits beside the content it stands in for:
 *
 *   <ErrorAlert error={positions.error} onRetry={() => void positions.refetch()} /> */

import type { ReactElement } from "react";

import { describeError, fieldLine } from "#shell/describe-error.ts";
import { OctagonXIcon } from "#vendor/lucide/octagon-x.tsx";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert.tsx";
import { Button } from "./button.tsx";

interface ErrorAlertProps {
  /** The error to show, such as a query's or a mutation's `error`; with `null` or `undefined` nothing renders. */
  readonly error: unknown;
  /** Adds a "Try again" button that calls it, such as a query's `refetch`. */
  readonly onRetry?: (() => void) | undefined;
  /** Places the alert, as with `mb-4`; its look is fixed. */
  readonly className?: string | undefined;
}

/** A destructive Alert describing `error`, announced at once to a screen reader and named by its title.
 *
 * @use For a query's or an API's error on the page, with a retry. A failed mutation raises a toast through toastError
 * instead, and QueryState shows every state of a query.
 * @see describeError, toastError, QueryState, ApiError, Alert
 *
 * @example
 * ```tsx
 * import { ErrorAlert } from "@basis/ui";
 *
 * <ErrorAlert error={new Error("The positions could not be loaded.")} onRetry={() => undefined} />;
 * ```
 */
function ErrorAlert({ error, onRetry, className }: ErrorAlertProps): ReactElement | null {
  if (error === null || error === undefined) {
    return null;
  }
  const { title, detail, fields, reference } = describeError(error);
  const lines = [...new Set(fields.map((field) => fieldLine(field)))];
  return (
    <Alert variant="destructive" className={className}>
      <OctagonXIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {detail === undefined ? null : <p>{detail}</p>}
        {lines.length === 0 ? null : (
          <ul className="list-disc pl-4 not-last:mb-4">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {reference === undefined ? null : (
          <p>
            Reference <span className="font-mono text-xs">{reference}</span>
          </p>
        )}
      </AlertDescription>
      {onRetry === undefined ? null : (
        <AlertAction>
          <Button size="xs" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}

export { ErrorAlert };
export type { ErrorAlertProps };
