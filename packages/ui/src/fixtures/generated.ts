/* orval's generated handlers, as fixture mode answers with them for what no fixture holds: in `vp dev` through
 * start.ts, and in a test through `checkRoutes`. A module of its own, so a test in a Node DOM never loads MSW's
 * service worker. */

import type { RequestHandler } from "msw";

/** orval's handler for an operation, `get<Operation>MockHandler`, which answers with generated data when called with no
 * argument. Its siblings that end in a status, such as `getBondMockHandler404`, answer that status, and are left out. */
const generatedHandlerName = /^get\w+MockHandler$/u;

function isRequestHandler(value: unknown): value is RequestHandler {
  return (
    typeof value === "object" && value !== null && "run" in value && typeof value.run === "function"
  );
}

/** One handler for each operation in the app's generated MSW module, each answering with orval's generated data. */
function generatedHandlers(generated: Readonly<Record<string, unknown>>): RequestHandler[] {
  return Object.entries(generated)
    .filter(([name]) => generatedHandlerName.test(name))
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([, factory]) => {
      const handler: unknown =
        typeof factory === "function" ? Reflect.apply(factory, undefined, []) : undefined;
      return isRequestHandler(handler) ? [handler] : [];
    });
}

export { generatedHandlers };
