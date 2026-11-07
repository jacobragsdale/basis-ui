import "#styles.css";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  FunnelIcon,
} from "@basis/ui";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { computedColour } from "./test-support.ts";

function NoTrades(props: ComponentProps<typeof Empty>): ReactElement {
  return (
    <Empty {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon" data-testid="media">
          <FunnelIcon />
        </EmptyMedia>
        <EmptyTitle>No trades match these filters</EmptyTitle>
        <EmptyDescription>Widen the date range or clear a filter.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">Clear filters</Button>
      </EmptyContent>
    </Empty>
  );
}

describe("Empty", () => {
  test("shows its title and description, centred, with what to do next", async () => {
    const screen = await render(<NoTrades data-testid="empty" />);
    await expect.element(screen.getByText("No trades match these filters")).toBeVisible();
    await expect.element(screen.getByText("Widen the date range or clear a filter.")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();
    expect(getComputedStyle(screen.getByTestId("empty").element()).textAlign).toBe("center");
  });

  test("the outline variant draws a dashed border, and the default none", async () => {
    const screen = await render(
      <>
        <NoTrades data-testid="default" />
        <NoTrades variant="outline" data-testid="outline" />
      </>,
    );
    const plain = getComputedStyle(screen.getByTestId("default").element());
    const outline = getComputedStyle(screen.getByTestId("outline").element());
    expect(plain.borderTopWidth).toBe("0px");
    expect(outline.borderTopWidth).toBe("1px");
    expect(outline.borderTopStyle).toBe("dashed");
    expect(outline.borderTopColor).toBe(computedColour("var(--border)"));
  });

  test("the icon variant of its media sets the icon on a muted tile", async () => {
    const screen = await render(
      <>
        <EmptyMedia data-testid="plain">
          <FunnelIcon />
        </EmptyMedia>
        <EmptyMedia variant="icon" data-testid="tile">
          <FunnelIcon />
        </EmptyMedia>
      </>,
    );
    const plain = getComputedStyle(screen.getByTestId("plain").element());
    const tile = getComputedStyle(screen.getByTestId("tile").element());
    expect(plain.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(tile.backgroundColor).toBe(computedColour("var(--muted)"));
  });
});
