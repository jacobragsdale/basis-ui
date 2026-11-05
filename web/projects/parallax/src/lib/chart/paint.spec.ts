import { describe, expect, it } from "vitest";

import { scaledFont } from "./paint";

describe("scaledFont", () => {
  it("scales the theme's size in pixels and sets a weight, and leaves a font without one alone", () => {
    expect(scaledFont("13px system-ui, sans-serif", 1.25, "600")).toBe("600 16px system-ui, sans-serif");
    expect(scaledFont("12.5px Arial", 2, "bold")).toBe("bold 25px Arial");
    expect(scaledFont("caption", 2, "600")).toBe("caption");
  });
});
