/* Patches the worker's `fetch` so that the engine's module arrives with its memory capped. */

import { capMemory } from "./cap-memory.ts";

/** Makes this worker's fetches of the engine's module return it with its memory capped. */
function capFetch(): void {
  /* oxlint-disable eslint/no-restricted-globals -- this wraps the worker's own fetch of the engine's module, in a test
   * worker that calls no API, so there is no generated client to go through. */
  const fetchModule = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    /* oxlint-enable eslint/no-restricted-globals */
    const response = await fetchModule(input, init);
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes("parallax_wasm_bg.wasm")) {
      return response;
    }
    const capped = capMemory(new Uint8Array(await response.arrayBuffer()));
    return new Response(capped, { headers: { "content-type": "application/wasm" } });
  };
}

export { capFetch };
