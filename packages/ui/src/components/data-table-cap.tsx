/* What DataTable shows instead of a table past its row cap: one error, which names the cap and sends the data to
 * parallax's grid. A DataTable draws every row it holds into the page, which is what lets its cells hold links and
 * buttons, and on a Citrix desktop's CPU that stops being quick in the low thousands; parallax's `<Grid>` draws only
 * the rows on screen, on a canvas, and holds a hundred thousand. */

import { useEffect } from "react";
import type { ReactElement } from "react";

import { useTelemetry } from "#shell/telemetry.ts";
import { TriangleExclamationPointIcon } from "#vendor/lucide/triangle-exclamation-point.tsx";

import { Alert, AlertDescription, AlertTitle } from "./alert.tsx";

const counts = new Intl.NumberFormat("en-US");

/** The error's words, which the alert shows and telemetry reports. */
function capMessage(label: string, rows: number, cap: number): string {
  return `${label} has ${counts.format(rows)} rows, past DataTable's cap of ${counts.format(cap)}.`;
}

/** The error a DataTable shows in place of its rows once they pass its cap. It reports the error to telemetry too, so
 * the app's developers hear of it. */
function RowCapAlert({
  label,
  rows,
  cap,
  className,
}: {
  readonly label: string;
  readonly rows: number;
  readonly cap: number;
  readonly className: string | undefined;
}): ReactElement {
  const telemetry = useTelemetry();
  const message = capMessage(label, rows, cap);
  useEffect(() => {
    telemetry.error(new RangeError(message), { cap, rows, source: "data-table" });
  }, [telemetry, message, cap, rows]);
  return (
    <Alert variant="destructive" className={className}>
      <TriangleExclamationPointIcon />
      <AlertTitle>Too many rows for this table</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <p>
          Show data this size in parallax&apos;s <code>&lt;Grid&gt;</code>, from{" "}
          <code>@basis/parallax</code>, which draws only the rows on screen.
        </p>
      </AlertDescription>
    </Alert>
  );
}

export { RowCapAlert };
