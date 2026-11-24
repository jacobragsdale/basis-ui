import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { BoardSection } from "./board.tsx";

describe("Board", () => {
  test("shows each cell as a list named by its lane and column, with its cards", async () => {
    const screen = await render(<BoardSection />);
    const board = screen.getByRole("region", { name: "Tickets", exact: true });
    await expect.element(board.getByRole("list", { name: "Doing" })).toBeVisible();
    await expect
      .element(
        board
          .getByRole("list", { name: "Doing" })
          .getByRole("button", { name: "102 Retry the vendor feed" }),
      )
      .toBeVisible();
    const lanes = screen.getByRole("region", { name: "Tickets by person" });
    await expect.element(lanes.getByRole("list", { name: "Blake, Doing" })).toBeVisible();
    await expect.element(lanes.getByText("On hold")).toBeVisible();
    await expect
      .element(board.getByRole("list", { name: "To do" }).getByRole("button").first())
      .toBeVisible();
  });

  test("moves a card to another column through its menu", async () => {
    const screen = await render(<BoardSection />);
    const board = screen.getByRole("region", { name: "Tickets", exact: true });
    await board.getByRole("button", { name: "Move 101 Index the settlement batch to" }).click();
    await page.getByRole("menuitem", { name: "Done" }).click();
    await expect
      .element(
        board
          .getByRole("list", { name: "Done" })
          .getByRole("button", { name: "101 Index the settlement batch" }),
      )
      .toBeVisible();
  });

  test("moves a card to another lane through its menu", async () => {
    const screen = await render(<BoardSection />);
    const lanes = screen.getByRole("region", { name: "Tickets by person" });
    await lanes.getByRole("button", { name: "Move 102 Retry the vendor feed to" }).click();
    await page.getByRole("menuitem", { name: "Blake" }).click();
    await expect
      .element(
        lanes
          .getByRole("list", { name: "Blake, Doing" })
          .getByRole("button", { name: "102 Retry the vendor feed" }),
      )
      .toBeVisible();
  });

  test("moves a card by dragging it onto another cell", async () => {
    const screen = await render(<BoardSection />);
    const board = screen.getByRole("region", { name: "Tickets", exact: true });
    const card = board.getByRole("button", { name: "103 Rework the position loader" });
    await card.dropTo(board.getByRole("list", { name: "In review" }));
    await expect
      .element(
        board
          .getByRole("list", { name: "In review" })
          .getByRole("button", { name: "103 Rework the position loader" }),
      )
      .toBeVisible();
  });

  test("makes one card the only tab stop", async () => {
    const screen = await render(<BoardSection />);
    const board = screen.getByRole("region", { exact: true, name: "Tickets" });
    await expect
      .element(board.getByRole("button", { name: "101 Index the settlement batch" }))
      .toHaveAttribute("tabindex", "0");
    await expect
      .element(board.getByRole("button", { name: "102 Retry the vendor feed" }))
      .toHaveAttribute("tabindex", "-1");
  });

  test("moves the focus with the arrow keys, and Space chooses", async () => {
    const screen = await render(<BoardSection />);
    const board = screen.getByRole("region", { exact: true, name: "Tickets" });
    board.getByRole("button", { name: "101 Index the settlement batch" }).element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect
      .element(board.getByRole("button", { name: "102 Retry the vendor feed" }))
      .toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    const loader = board.getByRole("button", { name: "103 Rework the position loader" });
    await expect.element(loader).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect.element(loader).toHaveAttribute("aria-pressed", "true");
  });

  test("says what an empty cell holds", async () => {
    const screen = await render(<BoardSection />);
    const board = screen.getByRole("region", { name: "Tickets", exact: true });
    await board.getByRole("button", { name: "Move 106 Fix duplicate imports to" }).click();
    await page.getByRole("menuitem", { name: "To do" }).click();
    await expect
      .element(board.getByRole("list", { name: "Done" }).getByText("Nothing here"))
      .toBeVisible();
  });
});
