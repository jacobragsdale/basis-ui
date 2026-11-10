/* The Vite plugin that writes @basis/ui's head script into an app's index.html, in `vp dev` and `vp build` alike, so
 * the stored mode, density and motion apply before the first paint and no app keeps a copy of the script to drift. */

import type { Plugin } from "vite-plus";

import { headScript } from "#theme/preferences.ts";

/** Puts `headScript` in a `<script>` at the end of the page's `<head>`. As a classic inline script it runs while the
 * head is parsed, before the body is drawn and before the app's module script, which waits for the parse to end. */
function headScriptPlugin(): Plugin {
  return {
    name: "basis-ui:head-script",
    transformIndexHtml: () => [{ children: headScript, injectTo: "head", tag: "script" }],
  };
}

export { headScriptPlugin };
