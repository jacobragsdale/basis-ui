/* The demo's entry point: the router in BasisApp, the app shell every basis-ui app starts in. The demo calls no API,
 * so its user is anonymous and no one signs in. */

import "./styles.css";

import { BasisApp, fakeSignIn } from "@basis/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { router } from "./router.ts";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("index.html has no #root element for the demo to render into.");
}
createRoot(root).render(
  <StrictMode>
    <BasisApp router={router} signIn={fakeSignIn({ user: null })} />
  </StrictMode>,
);
