import "#styles.css";

import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { CardSection } from "./card.tsx";

function FullCard({ size }: { readonly size: "default" | "sm" }): ReactElement {
  return (
    <Card size={size}>
      <CardHeader>
        <CardTitle>Desk exposure</CardTitle>
        <CardDescription>As of the close</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>Within limits</CardContent>
      <CardFooter>Updated at the close</CardFooter>
    </Card>
  );
}

/** The card that holds `element`. */
function cardOf(element: Element): HTMLElement {
  const card = element.closest<HTMLElement>('[data-slot="card"]');
  if (card === null) {
    throw new Error("The element is not inside a card.");
  }
  return card;
}

describe("Card", () => {
  test("shows each part's content, and its action is a button named by its text", async () => {
    const screen = await render(<FullCard size="default" />);
    await expect.element(screen.getByText("Desk exposure")).toBeVisible();
    await expect.element(screen.getByText("As of the close")).toBeVisible();
    await expect.element(screen.getByText("Within limits")).toBeVisible();
    await expect.element(screen.getByText("Updated at the close")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Refresh" })).toBeVisible();
  });

  test("the action sits at the header's end, level with the title", async () => {
    const screen = await render(<FullCard size="default" />);
    const title = screen.getByText("Desk exposure").element().getBoundingClientRect();
    const action = screen
      .getByRole("button", { name: "Refresh" })
      .element()
      .getBoundingClientRect();
    expect(action.left).toBeGreaterThanOrEqual(title.right);
    expect(action.top).toBe(title.top);
  });

  test.each([
    ["default", "16px"],
    ["sm", "12px"],
  ] as const)("at size %s, its content is inset %s", async (size, inset) => {
    const screen = await render(<FullCard size={size} />);
    const content = screen.getByText("Within limits").element();
    expect(getComputedStyle(content).paddingLeft).toBe(inset);
    expect(getComputedStyle(cardOf(content)).paddingTop).toBe(inset);
  });

  test("the footer's top line is the theme's border colour, not the text colour", async () => {
    const screen = await render(<FullCard size="default" />);
    const footer = getComputedStyle(screen.getByText("Updated at the close").element());
    expect(footer.borderTopWidth).toBe("1px");
    expect(footer.borderTopColor).not.toBe(footer.color);
  });
});

describe("the Card section", () => {
  test("shows a card at each size", async () => {
    const screen = await render(<CardSection />);
    const sizes = screen
      .getByText("Desk exposure")
      .all()
      .map((title) => cardOf(title.element()).dataset["size"]);
    expect(sizes).toStrictEqual(["default", "sm"]);
  });
});
