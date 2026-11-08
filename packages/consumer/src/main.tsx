import "./styles.css";
import { anonymousSignIn, BasisApp } from "@basis/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { router } from "./router.ts";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("index.html has no #root element for the app to render into.");
}
createRoot(root).render(
  <StrictMode>
    <BasisApp router={router} signIn={anonymousSignIn()} />
  </StrictMode>,
);
