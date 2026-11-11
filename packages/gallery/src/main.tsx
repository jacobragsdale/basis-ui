/* The gallery's entry point. The head script that `basisPlugins()` writes into index.html has already applied the
 * stored theme, mode and density; a query that names any of them replaces them for this page alone, and otherwise the
 * page follows the stored choice as it changes. */

import "./styles.css";

import { applyPreferences, followPreferences, readPreferences, resolveMode } from "@basis/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Gallery } from "./gallery.tsx";
import { pageFor, sectionFor } from "./pages.ts";
import { queryPreferences } from "./preferences.ts";

const { search } = globalThis.location;
const systemDark = globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
const stored = readPreferences();
const asked = queryPreferences(search, stored);
if (asked === null) {
  followPreferences();
} else {
  applyPreferences(document.documentElement, asked, systemDark);
}
const shown = asked ?? stored;

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("index.html has no #root element for the gallery to render into.");
}
createRoot(root).render(
  <StrictMode>
    <Gallery
      page={pageFor(search)}
      section={sectionFor(search)}
      search={search}
      mode={resolveMode(shown.mode, systemDark)}
      density={shown.density}
      theme={shown.theme}
    />
  </StrictMode>,
);
