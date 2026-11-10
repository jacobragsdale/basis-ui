/* Every route of the app, on its fixtures in fixtures/ as vp dev answers them: one test each, which fails on a
 * request nothing answers, an error the page reports, raises or logs, and what axe finds. A route with a parameter
 * opens at a fixture's value for it; checkRoutes' params name one where no fixture gives it. Written with
 * @basis/ui/testing, so it runs in Chromium and in a Node DOM (BASIS_TEST_DOM=node vp test). */

import { checkRoutes } from "@basis/ui/testing";

import { routeTree } from "#routes.ts";

checkRoutes(routeTree);
