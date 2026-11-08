/* The generated client, as the app's code imports it: every hook, request function, query key and schema orval
 * generates from openapi.json. `vp run client-pull` rewrites `generated/` and never this file, so the rest of the app
 * imports from here, which the preset's lint enforces. */

/* oxlint-disable oxc/no-barrel-file -- this file is the generated client's whole surface, which changes on every pull;
 * naming each export would mean editing it by hand each time, and a bundle keeps only what the app imports. */
export * from "./generated/client.ts";
export * from "./generated/model/index.ts";
export * from "./generated/formats.ts";
