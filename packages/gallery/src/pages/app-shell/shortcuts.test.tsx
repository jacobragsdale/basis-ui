import "#styles.css";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ShortcutProvider,
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  useShortcut,
} from "@basis/ui";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

const tenors = [
  { label: "2Y", value: "2y" },
  { label: "10Y", value: "10y" },
];

/** Declares `r`, which calls `onRefresh`. */
function Refresh({
  onRefresh,
  description = "Refresh the positions",
}: {
  readonly onRefresh: () => void;
  readonly description?: string;
}): null {
  useShortcut("r", description, onRefresh);
  return null;
}

/** A Select of tenors, named Tenor. */
function TenorSelect(): ReactElement {
  return (
    <Select items={tenors} defaultValue="2y">
      <SelectTrigger aria-label="Tenor">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {tenors.map((tenor) => (
          <SelectItem key={tenor.value} value={tenor.value}>
            {tenor.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Page({ children }: { readonly children: ReactNode }): ReactElement {
  return <ShortcutProvider>{children}</ShortcutProvider>;
}

/** The sidebar's state, `expanded` or `collapsed`, as its `data-state` says. */
function sidebarState(root: ParentNode): string | undefined {
  return root.querySelector<HTMLElement>('[data-slot="sidebar"]')?.dataset["state"];
}

beforeEach(async () => {
  await page.viewport(1280, 800);
  await cookieStore.delete("basis-ui-sidebar");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cookieStore.delete("basis-ui-sidebar");
});

describe("ShortcutProvider", () => {
  test("a plain key runs its shortcut on the page", async () => {
    const onRefresh = vi.fn<() => void>();
    await render(
      <Page>
        <Refresh onRefresh={onRefresh} />
      </Page>,
    );
    await userEvent.keyboard("r");
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  test("a plain key is the Select's while its trigger has focus, which finds a choice by it", async () => {
    const onRefresh = vi.fn<() => void>();
    const screen = await render(
      <Page>
        <Refresh onRefresh={onRefresh} />
        <TenorSelect />
      </Page>,
    );
    screen.getByRole("combobox", { name: "Tenor" }).element().focus();
    await userEvent.keyboard("r");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  test("a plain key does nothing behind an open modal dialog", async () => {
    const onRefresh = vi.fn<() => void>();
    const screen = await render(
      <Page>
        <Refresh onRefresh={onRefresh} />
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Book a trade</DialogTitle>
            <p>The ticket.</p>
          </DialogContent>
        </Dialog>
      </Page>,
    );
    await expect.element(screen.getByRole("dialog", { name: "Book a trade" })).toBeVisible();
    // A key pressed in the frame before the dialog takes the focus lands on the page's body.
    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "r" }));
    await userEvent.keyboard("r");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  test("lists each key once, with the shortcut it runs, when two declare the same key", async () => {
    const error = vi.spyOn(console, "error");
    await render(
      <Page>
        <Refresh onRefresh={vi.fn<() => void>()} />
        <Refresh onRefresh={vi.fn<() => void>()} description="Refresh the trades" />
      </Page>,
    );
    await userEvent.keyboard("?");
    const list = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect.element(list.getByText("Refresh the positions")).toBeVisible();
    await expect.element(list.getByText("Refresh the trades")).not.toBeInTheDocument();
    expect(error.mock.calls.flat().join(" ")).not.toMatch(/same key/u);
  });

  test("of two that declare the same key, the key runs the first", async () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    await render(
      <Page>
        <Refresh onRefresh={first} />
        <Refresh onRefresh={second} description="Refresh the trades" />
      </Page>,
    );
    await userEvent.keyboard("r");
    expect([first.mock.calls.length, second.mock.calls.length]).toStrictEqual([1, 0]);
  });

  test("the sidebar's Ctrl+B is in the list, and works with Caps Lock on", async () => {
    const screen = await render(
      <Page>
        <SidebarProvider>
          <Sidebar>
            <SidebarContent>Pages</SidebarContent>
          </Sidebar>
          <SidebarInset render={<div />}>Page</SidebarInset>
        </SidebarProvider>
      </Page>,
    );
    expect(sidebarState(screen.container)).toBe("expanded");
    // Caps Lock on: the key is a capital B, and Shift is not held.
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ctrlKey: true, key: "B" }),
    );
    await expect.poll(() => sidebarState(screen.container)).toBe("collapsed");
    await userEvent.keyboard("?");
    const list = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect.element(list.getByText("Toggle the sidebar")).toBeVisible();
  });
});
