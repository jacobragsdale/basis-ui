/* The engine's worker as the package ships it, `@basis/parallax/worker`, with the engine's WebAssembly memory kept
 * where the bench reads it. The engine starts on the page's first message, after this module has run. */

// oxlint-disable-next-line import/no-unassigned-import -- the package's worker runs for its effect: it serves the engine.
import "@basis/parallax/worker";

import { watchMemory } from "./memory.ts";

watchMemory();
