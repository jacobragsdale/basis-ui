/* ctzd writes its apps' vite.config.ts, tsconfig.json and styles.css by hand, with exactly the lines this package's
 * README shows. packages/consumer is such an app, checked and built with the rest of the workspace; this test holds
 * its three files equal to the README's, so the README cannot drift from configuration that works. */

import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

function consumerFile(path: string): string {
  return readFileSync(new URL(`../../consumer/${path}`, import.meta.url), "utf8");
}

/** The README's code blocks in `language` under "How to build an app on @basis/ui", with the list's indent removed. */
function setupBlocks(language: string): string[] {
  const start = readme.indexOf("## How to build an app on @basis/ui");
  const end = readme.indexOf("\n## ", start + 1);
  const section = readme.slice(start, end);
  const ticks = "`".repeat(3);
  const fence = new RegExp(`^( *)${ticks}${language}\\n([\\s\\S]*?)^\\1${ticks}$`, "gmu");
  return [...section.matchAll(fence)].map(([, indent = "", body = ""]) =>
    body
      .split("\n")
      .map((line) => line.slice(indent.length))
      .join("\n"),
  );
}

describe("the README's app setup", () => {
  test("vite.config.ts is the consumer app's, line for line", () => {
    const blocks = setupBlocks("ts").filter((block) => block.includes("basisPreset"));
    expect(blocks).toHaveLength(1);
    expect(consumerFile("vite.config.ts")).toBe(blocks[0]);
  });

  test("tsconfig.json is the consumer app's, line for line", () => {
    expect(setupBlocks("json")).toStrictEqual([consumerFile("tsconfig.json")]);
  });

  test("src/styles.css is the consumer app's one line", () => {
    expect(setupBlocks("css")).toStrictEqual([consumerFile("src/styles.css")]);
  });

  test("the consumer app's .gitignore names .fixtures/, as the README's last step says", () => {
    expect(readme).toContain("Name `.fixtures/` in the app's `.gitignore`.");
    expect(consumerFile(".gitignore").split("\n")).toContain(".fixtures/");
  });
});
