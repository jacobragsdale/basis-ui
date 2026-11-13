/* A shortcut's keys as the listener reads them: an unknown modifier is an error the developer sees at once, `ctrl`
 * is `mod`, a held key runs once, a key the page already handled runs none, and no shortcut runs behind a modal
 * dialog. */

import "#styles.css";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  ShortcutProvider,
  useShortcut,
} from "@basis/ui";
import { Component } from "react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

/** Keeps React's report of the error caught out of the test's output. */
function quiet(): void {
  // React reports the error the boundary caught; the test reads it on the page.
}

/** Declares `keys`, which calls `run`. */
function Declares({ keys, run }: { readonly keys: string; readonly run: () => void }): null {
  useShortcut(keys, "Delete the selected trades", run);
  return null;
}

/** Shows the message of an error its children throw. */
class Caught extends Component<{ readonly children: ReactNode }, { readonly message: string }> {
  public constructor(props: { readonly children: ReactNode }) {
    super(props);
    this.state = { message: "" };
  }

  public static getDerivedStateFromError(error: unknown): { readonly message: string } {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  public override render(): ReactNode {
    return this.state.message === "" ? (
      this.props.children
    ) : (
      <p role="alert">{this.state.message}</p>
    );
  }
}

/** Presses `key` on the page's body, as the browser sends it. */
function pressOnBody(init: KeyboardEventInit): void {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

describe("A shortcut's keys", () => {
  test("ctrl+d runs on Ctrl+D, and never on a bare d", async () => {
    const run = vi.fn<() => void>();
    await render(
      <ShortcutProvider>
        <Declares keys="ctrl+d" run={run} />
      </ShortcutProvider>,
    );
    await userEvent.keyboard("d");
    expect(run).not.toHaveBeenCalled();
    await userEvent.keyboard("{Control>}d{/Control}");
    expect(run).toHaveBeenCalledOnce();
  });

  test("an unknown modifier is thrown in development, as an ERROR line with its fix", async () => {
    vi.spyOn(console, "error").mockImplementation(quiet);
    await render(
      <Caught>
        <ShortcutProvider>
          <Declares keys="cmd+d" run={vi.fn<() => void>()} />
        </ShortcutProvider>
      </Caught>,
    );
    await expect
      .element(
        page.getByText(/^ERROR the shortcut "cmd\+d" names "cmd", which is no modifier: write/u),
      )
      .toBeVisible();
  });

  test("Mod+S, in capitals, runs from inside a field, as a combination with a modifier", async () => {
    const run = vi.fn<() => void>();
    const screen = await render(
      <ShortcutProvider>
        <Declares keys="Mod+S" run={run} />
        <Input aria-label="Note" />
      </ShortcutProvider>,
    );
    await screen.getByRole("textbox", { name: "Note" }).click();
    await userEvent.keyboard("{Control>}s{/Control}");
    expect(run).toHaveBeenCalledOnce();
  });

  test("a key held down runs once, and a key already handled runs none", async () => {
    const run = vi.fn<() => void>();
    await render(
      <ShortcutProvider>
        <Declares keys="mod+enter" run={run} />
      </ShortcutProvider>,
    );
    pressOnBody({ ctrlKey: true, key: "Enter" });
    pressOnBody({ ctrlKey: true, key: "Enter", repeat: true });
    const handled = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "Enter",
    });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    expect(run).toHaveBeenCalledOnce();
  });

  test("a combination with a modifier runs none behind an open modal dialog", async () => {
    const run = vi.fn<() => void>();
    await render(
      <ShortcutProvider>
        <Declares keys="mod+s" run={run} />
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Book a trade</DialogTitle>
          </DialogContent>
        </Dialog>
      </ShortcutProvider>,
    );
    await expect.element(page.getByRole("dialog", { name: "Book a trade" })).toBeVisible();
    await userEvent.keyboard("{Control>}s{/Control}");
    expect(run).not.toHaveBeenCalled();
  });
});
