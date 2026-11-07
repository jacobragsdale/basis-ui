/* The app's router. Registering its type gives every `Link`, `useParams` and `useNavigate` the app's routes; a test
 * makes a router of its own from `routeTree`, on a memory history. */

import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routes.ts";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { router };
