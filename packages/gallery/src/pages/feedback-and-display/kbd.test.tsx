import "#styles.css";

import { Kbd, KbdGroup } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { computedColour } from "./test-support.ts";

describe("Kbd", () => {
  test("is a kbd element holding its key, on the muted surface", async () => {
    const screen = await render(<Kbd>Esc</Kbd>);
    const key = screen.getByText("Esc", { exact: true }).element();
    expect(key.tagName).toBe("KBD");
    expect(getComputedStyle(key).backgroundColor).toBe(computedColour("var(--muted)"));
  });

  test("a group is a kbd holding a kbd for each key, side by side", async () => {
    const screen = await render(
      <KbdGroup data-testid="group">
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>,
    );
    const group = screen.getByTestId("group").element();
    expect(group.tagName).toBe("KBD");
    expect([...group.children].map((key) => [key.tagName, key.textContent])).toStrictEqual([
      ["KBD", "Ctrl"],
      ["KBD", "K"],
    ]);
    const ctrl = screen.getByText("Ctrl").element().getBoundingClientRect();
    const key = screen.getByText("K", { exact: true }).element().getBoundingClientRect();
    expect(key.left).toBeGreaterThan(ctrl.right);
    expect(key.top).toBe(ctrl.top);
  });
});
