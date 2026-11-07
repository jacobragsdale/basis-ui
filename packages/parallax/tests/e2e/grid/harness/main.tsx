/* The end-to-end harness's entry: the page of grids the specs drive. */

import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Harness } from "./harness.tsx";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("index.html has no #root element for the harness to render into.");
}
createRoot(root).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
