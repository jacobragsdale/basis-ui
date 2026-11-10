import "#styles.css";

import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { AlertDialogExample, DialogExample } from "./dialogs.tsx";
import { DrawerExample, SheetExample } from "./panels.tsx";

/* A veil covers the whole screen, so a fade of it repaints and resends the whole screen every frame on a desktop drawn
 * on the CPU. It appears at once, and only the popup over it fades. */

const overlays = [
  {
    example: <DialogExample />,
    name: "Dialog",
    popup: "dialog-content",
    trigger: "Edit position",
    veil: "dialog-overlay",
  },
  {
    example: <AlertDialogExample />,
    name: "Alert Dialog",
    popup: "alert-dialog-content",
    trigger: "Delete view",
    veil: "alert-dialog-overlay",
  },
  {
    example: <SheetExample side="right" />,
    name: "Sheet",
    popup: "sheet-content",
    trigger: "Trade details, right",
    veil: "sheet-overlay",
  },
  {
    example: <DrawerExample />,
    name: "Drawer",
    popup: "drawer-popup",
    trigger: "Drawer, down",
    veil: "drawer-overlay",
  },
] as const;

/** The longest of an element's transition durations, in milliseconds. */
function longestTransition(slot: string): number {
  const element = document.querySelector(`[data-slot="${slot}"]`);
  if (element === null) {
    throw new Error(`Nothing has data-slot="${slot}".`);
  }
  const durations = getComputedStyle(element).transitionDuration.split(",");
  const millisecondsPerSecond = 1000;
  return Math.max(
    ...durations.map(
      (duration) => Number(duration.trim().replace(/s$/u, "")) * millisecondsPerSecond,
    ),
  );
}

describe("a veil", () => {
  test.each(overlays)(
    "behind a $name appears at once, and only the popup fades",
    async ({ example, popup, trigger, veil }) => {
      const screen = await render(example);
      await userEvent.click(screen.getByRole("button", { name: trigger }));
      await expect.poll(() => document.querySelector(`[data-slot="${veil}"]`)).not.toBeNull();
      expect(longestTransition(veil)).toBe(0);
      expect(longestTransition(popup)).toBeGreaterThan(0);
    },
  );
});
