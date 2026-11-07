import "#styles.css";

import { Button, ButtonGroup, ButtonGroupSeparator, ButtonGroupText, Input } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { ButtonGroupSection } from "./button-group.tsx";

describe("ButtonGroup", () => {
  test("is a group named by its aria-label, holding its buttons", async () => {
    const screen = await render(<ButtonGroupSection />);
    const group = screen.getByRole("group", { name: "Quote as" });
    await expect.element(group).toBeVisible();
    await expect.element(group.getByRole("button", { name: "Yield" })).toBeVisible();
  });

  test("horizontal joins its buttons in a row: one outline, rounded only at the ends", async () => {
    const screen = await render(
      <ButtonGroup aria-label="Quote as">
        <Button variant="outline">Price</Button>
        <Button variant="outline">Yield</Button>
        <Button variant="outline">Spread</Button>
      </ButtonGroup>,
    );
    const [first, middle, last] = ["Price", "Yield", "Spread"].map((name) =>
      getComputedStyle(screen.getByRole("button", { name }).element()),
    );
    expect(first?.borderTopRightRadius).toBe("0px");
    expect(first?.borderTopLeftRadius).not.toBe("0px");
    expect(middle?.borderLeftWidth).toBe("0px");
    expect([middle?.borderTopLeftRadius, middle?.borderTopRightRadius]).toStrictEqual([
      "0px",
      "0px",
    ]);
    expect(last?.borderTopRightRadius).not.toBe("0px");
  });

  test("its orientations differ: vertical stacks its buttons in a column", async () => {
    const screen = await render(
      <>
        <ButtonGroup aria-label="Row">
          <Button variant="outline">A</Button>
          <Button variant="outline">B</Button>
        </ButtonGroup>
        <ButtonGroup aria-label="Column" orientation="vertical">
          <Button variant="outline">C</Button>
          <Button variant="outline">D</Button>
        </ButtonGroup>
      </>,
    );
    const row = getComputedStyle(screen.getByRole("group", { name: "Row" }).element());
    const column = getComputedStyle(screen.getByRole("group", { name: "Column" }).element());
    expect([row.flexDirection, column.flexDirection]).toStrictEqual(["row", "column"]);
    const top = screen.getByRole("button", { name: "C" }).element().getBoundingClientRect();
    const bottom = screen.getByRole("button", { name: "D" }).element().getBoundingClientRect();
    expect(bottom.top).toBe(top.bottom);
  });

  test("its text can be the label of its input, and its separator is a separator", async () => {
    const screen = await render(
      <ButtonGroup aria-label="Add par">
        <ButtonGroupText render={<label htmlFor="par">Par</label>} />
        <Input id="par" />
        <ButtonGroupSeparator />
        <Button variant="secondary">Apply</Button>
      </ButtonGroup>,
    );
    await expect.element(screen.getByRole("textbox", { name: "Par" })).toBeVisible();
    await expect
      .element(screen.getByRole("separator"))
      .toHaveAttribute("aria-orientation", "vertical");
  });
});
