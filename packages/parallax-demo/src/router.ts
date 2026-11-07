/* The demo's router, on the address's hash, so that the built demo serves from any static file server, in any folder,
 * with no rewrite of its addresses to index.html. Registering its type gives every `Link` and route API the demo's
 * routes; a test makes a router of its own from `routeTree`. */

import { createHashHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "./routes.ts";

const router = createRouter({ history: createHashHistory(), routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { router };
