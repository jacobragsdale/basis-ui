import { headScript } from "@basis/ui";
import { expect, test } from "vite-plus/test";

import html from "./index.html?raw";

/** Text with each run of whitespace made one space, since the formatter re-indents the script inside index.html. */
function squashed(text: string): string {
  return text.replaceAll(/\s+/gu, " ").trim();
}

test("index.html's inline script is @basis/ui's headScript, which applies the mode and density before the first paint", () => {
  const page = new DOMParser().parseFromString(html, "text/html");
  const inline = [...page.head.querySelectorAll("script:not([src])")];
  expect(inline).toHaveLength(1);
  expect(squashed(inline[0]?.textContent ?? "")).toBe(squashed(headScript));
});
