import "#styles.css";

import { Badge, Button, CheckIcon, InfoIcon } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { Icons } from "./icons.tsx";

/** Every icon @basis/ui's root exports, each component under all the names it is exported as. */
async function exportedIcons(): Promise<Map<unknown, string[]>> {
  const exports: Record<string, unknown> = await import("@basis/ui");
  const icons = new Map<unknown, string[]>();
  for (const [name, value] of Object.entries(exports)) {
    if (name.endsWith("Icon")) {
      icons.set(value, [...(icons.get(value) ?? []), name]);
    }
  }
  return icons;
}

describe("an icon", () => {
  test("is a 24 px SVG in the text's colour, hidden from assistive technology", async () => {
    const screen = await render(
      <p className="text-destructive">
        <CheckIcon />
      </p>,
    );
    const svg = screen.container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    const box = svg?.getBoundingClientRect();
    expect([box?.width, box?.height]).toStrictEqual([24, 24]);
    const { color } = getComputedStyle(screen.container.querySelector("p") ?? document.body);
    expect(getComputedStyle(svg ?? document.body).stroke).toBe(color);
  });

  test("named by aria-label, assistive technology reads it", async () => {
    const screen = await render(<InfoIcon aria-label="Indicative price" />);
    const icon = screen.getByLabelText("Indicative price");
    await expect.element(icon).toBeVisible();
    await expect.element(icon).not.toHaveAttribute("aria-hidden");
  });

  test("takes its size from the component it sits in", async () => {
    const screen = await render(
      <>
        <Button size="sm">
          <CheckIcon />
          Save
        </Button>
        <Badge>
          <CheckIcon />
          Settled
        </Badge>
      </>,
    );
    const [inButton, inBadge] = [...screen.container.querySelectorAll("svg")].map((svg) => {
      const box = svg.getBoundingClientRect();
      return [box.width, box.height];
    });
    expect(inButton).toStrictEqual([14, 14]);
    expect(inBadge).toStrictEqual([12, 12]);
  });
});

describe("the icons page", () => {
  test("shows every icon the package exports, each named by one of its export names", async () => {
    const screen = await render(<Icons />);
    const tiles = [...screen.container.querySelectorAll("li")];
    const shown = new Set(tiles.map((tile) => tile.textContent));
    const icons = await exportedIcons();
    expect(tiles).toHaveLength(icons.size);
    for (const names of icons.values()) {
      expect(
        names.some((name) => shown.has(name)),
        names.join(", "),
      ).toBe(true);
    }
    for (const tile of tiles) {
      expect(tile.querySelectorAll("svg"), tile.textContent).toHaveLength(1);
    }
  });
});
