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
  ShortcutScope,
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

/** Does nothing, in place of what a mocked function did. */
function nothing(): void {
  // Nothing to do.
}

/** Declares `shift+?`, the keys the `?` list takes, written another way. */
function Help(): null {
  useShortcut("shift+?", "Show the help", nothing);
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
    vi.spyOn(console, "error").mockImplementation(nothing);
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
  });

  test("of two that declare the same key, the key runs the first", async () => {
    vi.spyOn(console, "error").mockImplementation(nothing);
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

  test("two that take the same keys in one scope log a conflict, as one ERROR line with its fix", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(nothing);
    await render(
      <Page>
        <ShortcutScope name="Trades">
          <Refresh onRefresh={vi.fn<() => void>()} />
          <Refresh onRefresh={vi.fn<() => void>()} description="Refresh the trades" />
        </ShortcutScope>
      </Page>,
    );
    expect(error.mock.calls).toStrictEqual([
      [
        'ERROR two shortcuts take r on Trades: "Refresh the positions" runs and "Refresh the trades" never does. Give one of them other keys.',
      ],
    ]);
  });

  test("keys written two ways, such as shift+? and ?, are the same keys, and conflict", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(nothing);
    await render(
      <Page>
        <Help />
      </Page>,
    );
    expect(error.mock.calls).toStrictEqual([
      [
        'ERROR two shortcuts take shift+? everywhere: "Show the keyboard shortcuts" runs and "Show the help" never does. Give one of them other keys.',
      ],
    ]);
  });
});

describe("ShortcutScope", () => {
  test("a scope's shortcut wins over the app's for the same key, with no conflict", async () => {
    const error = vi.spyOn(console, "error");
    const app = vi.fn<() => void>();
    const trades = vi.fn<() => void>();
    await render(
      <Page>
        <Refresh onRefresh={app} />
        <ShortcutScope name="Trades">
          <Refresh onRefresh={trades} description="Refresh the trades" />
        </ShortcutScope>
      </Page>,
    );
    await userEvent.keyboard("r");
    expect([app.mock.calls.length, trades.mock.calls.length, error.mock.calls]).toStrictEqual([
      0,
      1,
      [],
    ]);
  });

  test("the app's shortcut answers again once the scope that took its key has gone", async () => {
    const app = vi.fn<() => void>();
    const trades = vi.fn<() => void>();
    function Shown({ scoped }: { readonly scoped: boolean }): ReactElement {
      return (
        <Page>
          <Refresh onRefresh={app} />
          {scoped ? (
            <ShortcutScope name="Trades">
              <Refresh onRefresh={trades} description="Refresh the trades" />
            </ShortcutScope>
          ) : null}
        </Page>
      );
    }
    const screen = await render(<Shown scoped />);
    await screen.rerender(<Shown scoped={false} />);
    await userEvent.keyboard("r");
    expect([app.mock.calls.length, trades.mock.calls.length]).toStrictEqual([1, 0]);
  });

  test("the list heads each scope's shortcuts with its name, innermost first, and the app's Everywhere", async () => {
    await render(
      <Page>
        <Refresh onRefresh={vi.fn<() => void>()} />
        <ShortcutScope name="Trades">
          <Refresh onRefresh={vi.fn<() => void>()} description="Refresh the trades" />
        </ShortcutScope>
      </Page>,
    );
    await userEvent.keyboard("?");
    const list = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect.element(list.getByText("Refresh the trades")).toBeVisible();
    const headings = [...list.element().querySelectorAll("th")];
    expect([
      headings.map((heading) => heading.textContent),
      list.getByText("Refresh the positions").query(),
    ]).toStrictEqual([["Trades", "Everywhere"], null]);
  });
});

describe("the sidebar's shortcut", () => {
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
