/* The demo's entry point: the router in BasisApp, the app shell every basis-ui app starts in. The demo is a
 * demonstration with no API: its datasets are files beside the page, so its user is anonymous, no one signs in, and
 * no build of it, a production one included, holds a sign-in adapter's key. */

import "./styles.css";

import { BasisApp, anonymousSignIn } from "@basis/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { router } from "./router.ts";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("index.html has no #root element for the demo to render into.");
}
createRoot(root).render(
  <StrictMode>
    <BasisApp router={router} signIn={anonymousSignIn()} />
  </StrictMode>,
);
