/* Every route of the example, on its committed fixtures, as `vp dev` answers them: no request goes unanswered, no
 * error is reported, raised or logged, and axe finds nothing, in Chromium and in a Node DOM alike. */

import { checkRoutes } from "@basis/ui/testing";

import { routeTree } from "#routes.ts";

checkRoutes(routeTree);
