/* The failures the app shell page shows: problems a basis API answers, and failures it never answered. */

import { ApiError } from "@basis/ui";
import type { AnyProblem } from "@basis/ui";
import { z } from "zod";

/** The error a call that the API answered with `problem` fails with. */
function failed(
  problem: AnyProblem & { readonly status: number; readonly title: string },
): ApiError {
  return new ApiError(problem.status, problem, problem.title);
}

const notFound = failed({
  detail: "No bond with ISIN US91282CRF04 is held in any book.",
  instance: "urn:uuid:019a5c3e-0000-7000-8000-000000000404",
  status: 404,
  title: "No bond has that ISIN",
  type: "unknown-bond",
});

const invalidOrder = failed({
  errors: [
    { detail: "Input should be greater than 0", pointer: "#/legs/0/price" },
    { detail: "Book ARCHIVE is closed to new positions.", pointer: "#/book" },
    { detail: "Should be a business day", parameter: "settle" },
  ],
  instance: "urn:uuid:019a5c3e-0000-7000-8000-000000000422",
  status: 422,
  title: "The request is not valid",
  type: "invalid-request",
});

const keysUnavailable = failed({
  detail: "The sign-in system's keys could not be fetched. Try again in a moment.",
  status: 503,
  title: "Sign-in keys are unavailable",
  type: "keys-unavailable",
});

const unreachable = new TypeError("Failed to fetch");

/** What a response that breaks its schema throws: a price sent as a number where the document says a string. */
const brokenResponse = z.object({ price: z.string() }).safeParse({ price: 99.5 }).error;

export { brokenResponse, invalidOrder, keysUnavailable, notFound, unreachable };
