/* The engine's worker with its memory capped, for the tests that run it out of memory: `fetch` is patched before the
 * engine starts, so it starts on the capped module. */

import { serve } from "#engine/serve.ts";

import { capFetch } from "./capped-fetch.ts";

capFetch();
serve();
