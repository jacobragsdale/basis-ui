/* ErrorAlert on the app shell page: a problem the API answered, a 422 that names its fields, one worth trying again,
 * and the two failures the API never answered. */

import { ErrorAlert } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import {
  brokenResponse,
  invalidOrder,
  keysUnavailable,
  notFound,
  unreachable,
} from "./failures.ts";

function retry(): void {
  // The gallery has no query to ask again.
}

function ErrorAlertSection(): ReactElement {
  return (
    <Section
      title="Error alert"
      description="A failed query's or mutation's error, read from the problem details the API answered: its title, its detail, the fields a 422 names and the request's reference. With onRetry it offers to try again."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <ErrorAlert error={notFound} />
        <ErrorAlert error={invalidOrder} />
        <ErrorAlert error={keysUnavailable} onRetry={retry} />
        <ErrorAlert error={unreachable} onRetry={retry} />
        <ErrorAlert error={brokenResponse} />
      </div>
    </Section>
  );
}

export { ErrorAlertSection };
