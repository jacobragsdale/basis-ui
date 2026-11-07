import { describe, expect, test } from "vite-plus/test";

import { parseLayout } from "#layout/layout.ts";
import { decodeLayout, encodeLayout } from "#layout/share.ts";

import { layouts } from "./fixtures.ts";

const linkLimit = 1500;

describe("layout links", () => {
  test("round-trip every layout the Rust crate writes", async () => {
    const links = await Promise.all(
      layouts.map(async (layout) => encodeLayout(parseLayout(layout))),
    );
    for (const link of links) {
      expect(link).toMatch(/^1\.[A-Za-z0-9_-]+$/u);
    }
    await expect(Promise.all(links.map(async (link) => decodeLayout(link)))).resolves.toStrictEqual(
      layouts,
    );
  });

  test("stay short enough for a URL", async () => {
    const link = await encodeLayout(parseLayout(layouts[1]));
    expect(link.length).toBeLessThan(linkLimit);
  });

  test("refuse text that is not a layout link, or a layout the schema rejects", async () => {
    await expect(decodeLayout("hello")).rejects.toThrow(/not a parallax layout link/u);
    const edited = await encodeLayout({ dataset: "x" });
    await expect(decodeLayout(`${edited.slice(0, -4)}AAAA`)).rejects.toThrow();
  });
});
