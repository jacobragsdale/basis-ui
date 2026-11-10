/* What a page asked `/api` for while `vp run shot` pictured it: each request, in the order it was made, with its
 * status and what answered it, which fixture mode names in the headers of answered-by.ts. A line reads
 *
 *   GET /api/bonds/US91282CRF04 200 fixture fixtures/sample-bond-US91282CRF04.json
 *
 * The source is `record`, `fixture`, `generated` or `none`, as fixture mode says, or `live` for an answer without its
 * headers, from the live API `BASIS_API_URL` names. A request with no answer yet reads `pending`, and one that failed
 * `failed` with the browser's reason. */

import { setTimeout as sleep } from "node:timers/promises";

import type { Page, Request } from "playwright";

import { fileHeader, sourceHeader } from "#fixtures/answered-by.ts";

/** A request to `/api`, and its answer once it has one. */
interface Exchange {
  readonly method: string;
  /** The path and query, as `/api/bonds/US91282CRF04?settle=2026-11-06`. */
  readonly path: string;
  answer?: { readonly status: number; readonly source: string; readonly file?: string };
  failure?: string;
  /** Whether its body has all arrived, or it failed. */
  done?: boolean;
}

/** The page's requests to `/api`, as lines, and a way to wait until none is in flight. */
interface Network {
  readonly lines: () => readonly string[];
  /** How many requests there were. */
  readonly count: () => number;
  /** Waits until no request to `/api` is in flight, or `limitMs` passes. */
  readonly quiet: (limitMs: number) => Promise<void>;
}

const apiPath = /^\/api(?:\/|$)/u;

/** The line an exchange reads as. */
function lineOf({ method, path, answer, failure }: Exchange): string {
  if (answer !== undefined) {
    return [method, path, String(answer.status), answer.source, answer.file ?? ""].join(" ").trim();
  }
  return failure === undefined
    ? `${method} ${path} pending`
    : `${method} ${path} failed (${failure}) none`;
}

const pollMs = 50;

/** Records the requests `page` makes to `/api` from now on. */
function recordNetwork(page: Page): Network {
  const exchanges = new Map<Request, Exchange>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (apiPath.test(url.pathname)) {
      exchanges.set(request, { method: request.method(), path: url.pathname + url.search });
    }
  });
  page.on("response", (response) => {
    const exchange = exchanges.get(response.request());
    if (exchange !== undefined) {
      const headers = response.headers();
      const file = headers[fileHeader];
      exchange.answer = {
        source: headers[sourceHeader] ?? "live",
        status: response.status(),
        ...(file === undefined ? {} : { file }),
      };
    }
  });
  page.on("requestfinished", (request) => {
    const exchange = exchanges.get(request);
    if (exchange !== undefined) {
      exchange.done = true;
    }
  });
  page.on("requestfailed", (request) => {
    const exchange = exchanges.get(request);
    if (exchange !== undefined) {
      exchange.failure = request.failure()?.errorText ?? "no reason given";
      exchange.done = true;
    }
  });
  const inFlight = (): number => [...exchanges.values()].filter(({ done }) => done !== true).length;
  const quiet = async (limitMs: number): Promise<void> => {
    if (inFlight() > 0 && limitMs > 0) {
      await sleep(pollMs);
      await quiet(limitMs - pollMs);
    }
  };
  return {
    count: () => exchanges.size,
    lines: () => [...exchanges.values()].map((exchange) => lineOf(exchange)),
    quiet,
  };
}

export { recordNetwork };
export type { Network };
