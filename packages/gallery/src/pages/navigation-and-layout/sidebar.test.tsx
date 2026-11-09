import "#styles.css";

import { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarTrigger } from "@basis/ui";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { SidebarParts, SidebarShell } from "./sidebar.tsx";
import {
  all,
  atDesktopWidth,
  atPhoneWidth,
  forgetSidebar,
  inCompactDensity,
  isTarget,
  only,
  sidebarCookie,
  sizeOf,
} from "./test-helpers.ts";

/** The sidebar's state, `expanded` or `collapsed`, as its `data-state` says. */
function stateOf(root: ParentNode): string | undefined {
  return only(root, '[data-slot="sidebar"]').dataset["state"];
}

/** The width of the sidebar's panel, in CSS pixels. */
function panelWidth(root: ParentNode): number {
  return sizeOf(only(root, '[data-slot="sidebar-container"]'))[0];
}

describe("Sidebar, folding", () => {
  beforeEach(async () => {
    await atDesktopWidth();
    await forgetSidebar();
  });

  afterEach(async () => {
    await forgetSidebar();
  });

  test("its trigger is a button named Toggle Sidebar, and its pages are links named by their text", async () => {
    const screen = await render(<SidebarShell />);
    await expect
      .element(screen.getByRole("button", { name: "Toggle Sidebar" }).first())
      .toBeVisible();
    await expect.element(screen.getByRole("link", { name: "Positions" })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Positions" }))
      .toHaveAttribute("data-active");
  });

  test("the trigger folds it to its 48 px icon rail and unfolds it to 256 px", async () => {
    const screen = await render(<SidebarShell />);
    const trigger = only(screen.container, '[data-slot="sidebar-trigger"]');
    expect([stateOf(screen.container), panelWidth(screen.container)]).toStrictEqual([
      "expanded",
      256,
    ]);
    await userEvent.click(trigger);
    expect(stateOf(screen.container)).toBe("collapsed");
    // The panel folds over the theme's short transition, while the page beside it moves at once.
    await expect.poll(() => panelWidth(screen.container)).toBe(48);
    await userEvent.click(trigger);
    expect(stateOf(screen.container)).toBe("expanded");
    await expect.poll(() => panelWidth(screen.container)).toBe(256);
  });

  test("Ctrl+B folds and unfolds it", async () => {
    const screen = await render(<SidebarShell />);
    await userEvent.keyboard("{Control>}b{/Control}");
    expect(stateOf(screen.container)).toBe("collapsed");
    await userEvent.keyboard("{Control>}b{/Control}");
    expect(stateOf(screen.container)).toBe("expanded");
  });

  test("onOpenChange without open hears each change, and the sidebar still folds", async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    const screen = await render(
      <SidebarProvider onOpenChange={onOpenChange}>
        <Sidebar>
          <SidebarContent>Pages</SidebarContent>
        </Sidebar>
        <SidebarInset render={<div />}>
          <SidebarTrigger />
        </SidebarInset>
      </SidebarProvider>,
    );
    await userEvent.click(only(screen.container, '[data-slot="sidebar-trigger"]'));
    expect(stateOf(screen.container)).toBe("collapsed");
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  test("the rail folds it too, and stays out of the tab order", async () => {
    const screen = await render(<SidebarShell />);
    const rail = only(screen.container, '[data-slot="sidebar-rail"]');
    expect(rail.tabIndex).toBe(-1);
    await userEvent.click(rail);
    expect(stateOf(screen.container)).toBe("collapsed");
  });

  test("it remembers being folded in the basis-ui-sidebar cookie, which a new page follows over defaultOpen", async () => {
    const first = await render(<SidebarShell defaultOpen />);
    await userEvent.click(only(first.container, '[data-slot="sidebar-trigger"]'));
    expect(sidebarCookie()).toBe("basis-ui-sidebar=false");
    await first.unmount();
    const second = await render(<SidebarShell defaultOpen />);
    expect(stateOf(second.container)).toBe("collapsed");
    await userEvent.click(only(second.container, '[data-slot="sidebar-trigger"]'));
    expect(sidebarCookie()).toBe("basis-ui-sidebar=true");
  });

  test("without a cookie, it starts as defaultOpen says", async () => {
    const screen = await render(<SidebarShell defaultOpen={false} />);
    expect(stateOf(screen.container)).toBe("collapsed");
  });
});

describe("Sidebar, its parts", () => {
  beforeEach(async () => {
    await atDesktopWidth();
    await forgetSidebar();
  });

  afterEach(async () => {
    await forgetSidebar();
  });

  test("folded to its rail, a page's tooltip names it", async () => {
    const screen = await render(<SidebarShell defaultOpen={false} />);
    await userEvent.hover(screen.getByRole("link", { name: "Settlements" }));
    await expect
      .element(screen.getByText("Settlements", { exact: true }).last())
      .toHaveAttribute("data-slot", "tooltip-content");
  });

  test("off the canvas, folded, its panel leaves the frame", async () => {
    const screen = await render(<SidebarShell collapsible="offcanvas" side="right" />);
    const frame = screen.container.firstElementChild;
    // The frame's inner right edge, inside its border: the edge of the box the fixed panel is placed in.
    const inside =
      frame === null
        ? 0
        : frame.getBoundingClientRect().left + frame.clientLeft + frame.clientWidth;
    await userEvent.click(only(screen.container, '[data-slot="sidebar-trigger"]'));
    // It slides out over the theme's short transition.
    await expect
      .poll(
        () =>
          only(screen.container, '[data-slot="sidebar-container"]').getBoundingClientRect().left,
      )
      .toBeGreaterThanOrEqual(inside);
  });

  test("below the md breakpoint, the trigger opens it as a dialog named Sidebar", async () => {
    await atPhoneWidth();
    const screen = await render(<SidebarShell />);
    await userEvent.click(only(screen.container, '[data-slot="sidebar-trigger"]'));
    const sheet = screen.getByRole("dialog", { name: "Sidebar" });
    await expect.element(sheet).toBeVisible();
    await expect.element(sheet.getByRole("link", { name: "History" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(sheet).not.toBeInTheDocument();
  });

  test("its buttons and links stay 24 px targets in the compact density", async () => {
    await inCompactDensity(async () => {
      const screen = await render(<SidebarParts />);
      const controls = all(screen.container, "button, a");
      expect(controls.filter((control) => !isTarget(control))).toStrictEqual([]);
      const shell = await render(<SidebarShell />);
      expect(isTarget(only(shell.container, '[data-slot="sidebar-trigger"]'))).toBe(true);
    });
  });

  test("on the icon rail, each page's button is a square of size-8", async () => {
    const screen = await render(<SidebarShell defaultOpen={false} />);
    expect(sizeOf(screen.getByRole("link", { name: "Reports" }).element())).toStrictEqual([32, 32]);
  });
});
