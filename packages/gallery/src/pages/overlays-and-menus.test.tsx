/* The overlays and menus page as a whole: every component has its section and a way to open it. Each component's
 * behaviour is tested beside its examples, in overlays-and-menus/. */

import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { OverlaysAndMenus } from "./overlays-and-menus.tsx";

// Each component's section, and the role and name of what opens it there.
const openers = [
  ["Dialog", "button", "Edit position"],
  ["Alert Dialog", "button", "Delete view"],
  ["TypedConfirmDialog", "button", "Delete book"],
  ["Sheet", "button", "Trade details, right"],
  ["Drawer", "button", "Drawer, down"],
  ["Popover", "button", "Filters"],
  ["Hover Card", "link", "UST 4.25% 2034"],
  ["Tooltip", "button", "Refresh"],
  ["Dropdown Menu", "button", "Actions"],
  ["Context Menu", "button", "UST 4.25% 2034, 5,000,000 par"],
  ["Menubar", "menuitem", "File"],
  ["Command", "button", "Command palette"],
] as const;

describe("the overlays and menus page", () => {
  test.each(openers)("has a %s section, opened from its %s named %s", async (title, role, name) => {
    const screen = await render(<OverlaysAndMenus />);
    const section = screen.getByRole("region", { name: title });
    await expect.element(section.getByRole(role, { name })).toBeVisible();
  });

  test.each(["top", "right", "bottom", "left"])("shows a sheet from the %s", async (side) => {
    const screen = await render(<OverlaysAndMenus />);
    const section = screen.getByRole("region", { name: "Sheet" });
    await expect
      .element(section.getByRole("button", { name: `Trade details, ${side}` }))
      .toBeVisible();
  });

  test("shows the command menu on the page as well as in the palette", async () => {
    const screen = await render(<OverlaysAndMenus />);
    const section = screen.getByRole("region", { name: "Command" });
    await expect.element(section.getByRole("combobox", { name: "Go to or run" })).toBeVisible();
    await expect.element(section.getByText("Last ran: nothing yet")).toBeVisible();
  });
});
