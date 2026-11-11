import "#styles.css";

import { Tree, TreeSelect } from "@basis/ui";
import type { TreeNode } from "@basis/ui";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

const books: readonly TreeNode<string>[] = [
  {
    children: [
      { label: "Treasuries", value: "ust" },
      { label: "Agencies", value: "agency" },
    ],
    label: "Rates",
    value: "rates",
  },
  {
    children: [{ label: "High yield", value: "hy" }],
    label: "Credit",
    value: "credit",
  },
];

/** The element that has the focus, by its text. */
function focusedText(): string | undefined {
  return document.activeElement?.textContent ?? undefined;
}

describe("Tree", () => {
  test("is a tree of treeitems, opened on the chosen node with its branch expanded", async () => {
    const screen = await render(<Tree aria-label="Books" nodes={books} defaultValue="agency" />);
    const tree = screen.getByRole("tree", { name: "Books" });
    await expect
      .element(tree.getByRole("treeitem", { name: "Rates" }))
      .toHaveAttribute("aria-expanded", "true");
    await expect
      .element(tree.getByRole("treeitem", { name: "Agencies" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(tree.getByRole("treeitem", { name: "Agencies" }))
      .toHaveAttribute("aria-level", "2");
    await expect
      .element(tree.getByRole("treeitem", { name: "High yield" }))
      .not.toBeInTheDocument();
  });

  test("Down moves a row, and Right expands a branch, then moves into it", async () => {
    const screen = await render(<Tree aria-label="Books" nodes={books} />);
    await userEvent.click(screen.getByRole("treeitem", { name: "Rates" }));
    await userEvent.keyboard("{ArrowDown}{ArrowRight}");
    await expect
      .element(screen.getByRole("treeitem", { name: "Credit" }))
      .toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(focusedText).toBe("High yield");
  });

  test("Enter chooses, and Left moves to the parent, then collapses it", async () => {
    const onValueChange = vi.fn<(value: string) => void>();
    const screen = await render(
      <Tree
        aria-label="Books"
        nodes={books}
        defaultExpanded={["credit"]}
        onValueChange={onValueChange}
      />,
    );
    await userEvent.click(screen.getByRole("treeitem", { name: "High yield" }));
    await userEvent.keyboard("{ArrowUp}{Enter}{ArrowDown}{ArrowLeft}{ArrowLeft}");
    expect(onValueChange.mock.calls.map(([value]) => value)).toStrictEqual(["hy", "credit"]);
    await expect
      .element(screen.getByRole("treeitem", { name: "High yield" }))
      .not.toBeInTheDocument();
    await expect.poll(focusedText).toBe("Credit");
  });

  test("with leaves only, a branch expands where a leaf would be chosen", async () => {
    const onValueChange = vi.fn<(value: string) => void>();
    const screen = await render(
      <Tree aria-label="Books" nodes={books} selectable="leaves" onValueChange={onValueChange} />,
    );
    await userEvent.click(screen.getByRole("treeitem", { name: "Credit" }));
    await expect.element(screen.getByRole("treeitem", { name: "High yield" })).toBeVisible();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("TreeSelect", () => {
  test("shows the chosen node's path, and a node chosen in its tree closes it", async () => {
    const onValueChange = vi.fn<(value: string) => void>();
    const screen = await render(
      <TreeSelect
        aria-label="Book"
        nodes={books}
        pickerLabel="Books"
        defaultValue="ust"
        onValueChange={onValueChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Book" });
    await expect.element(trigger).toHaveTextContent("Rates / Treasuries");
    await userEvent.click(trigger);
    await expect.poll(focusedText).toBe("Treasuries");
    await userEvent.click(page.getByRole("treeitem", { name: "Agencies" }));
    await expect.element(page.getByRole("tree", { name: "Books" })).not.toBeInTheDocument();
    await expect.element(trigger).toHaveTextContent("Rates / Agencies");
    expect(onValueChange).toHaveBeenCalledWith("agency");
  });
});
