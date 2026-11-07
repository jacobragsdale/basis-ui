import "#styles.css";

import { Toaster, createToastManager, toast } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { computedColour, inCompactDensity, withReducedMotion } from "./test-support.ts";

const statuses = ["success", "warning", "info", "destructive"] as const;
const types = ["default", ...statuses] as const;

const notifications = page.getByRole("region", { name: "Notifications" });

/** The toast whose title is `title`, once it shows. */
async function shownToast(title: string): Promise<HTMLElement> {
  const locator = notifications.getByRole("dialog", { name: title });
  await expect.element(locator).toBeVisible();
  const element = locator.element();
  if (!(element instanceof HTMLElement)) {
    throw new TypeError(`The toast "${title}" is not an HTML element.`);
  }
  return element;
}

/** The computed look that tells one toast's type from another. */
function lookOf(element: Element): string {
  const style = getComputedStyle(element);
  return [style.backgroundColor, style.color, style.borderColor].join(" ");
}

/** The SVG in a toast's icon slot, if it has one. */
function iconOf(element: Element): SVGElement | null {
  return element.querySelector('[data-slot="toast-icon"] svg');
}

/** Raises a toast with no timeout through the app's manager and moves focus to it with F6 and Tab. */
async function focusedToast(title: string): Promise<HTMLElement> {
  await render(<Toaster />);
  toast.add({ title, timeout: 0 });
  const raised = await shownToast(title);
  await userEvent.keyboard("{F6}");
  await expect.element(notifications).toHaveFocus();
  await userEvent.tab();
  await expect.element(raised).toHaveFocus();
  return raised;
}

interface PendingPromise {
  /** Settles the promise the toast follows. */
  readonly resolve: (value: string) => void;
  /** What `toast.promise` returned. */
  readonly shown: Promise<string>;
}

/** Renders a Toaster and raises a toast that follows a promise, still pending. */
async function promiseToast(): Promise<PendingPromise> {
  const manager = createToastManager();
  await render(<Toaster toastManager={manager} />);
  const { promise, resolve } = Promise.withResolvers<string>();
  const shown = manager.promise(promise, {
    loading: { title: "Pricing the portfolio" },
    success: (count) => ({ title: "Portfolio priced", description: count }),
    error: { title: "Pricing failed" },
  });
  return { resolve, shown };
}

describe("Toast, raised and closed", () => {
  test("toast.add, called outside React, shows a toast in the Notifications region, which announces it politely", async () => {
    await render(<Toaster />);
    toast.add({ title: "Trade booked", description: "Bought 5,000 par.", timeout: 0 });
    await expect.element(notifications).toHaveAttribute("aria-live", "polite");
    const raised = await shownToast("Trade booked");
    await expect.element(raised).toHaveAccessibleDescription("Bought 5,000 par.");
  });

  test("a high-priority toast is announced at once, as an alert", async () => {
    await render(<Toaster />);
    toast.add({ title: "Order rejected", type: "destructive", priority: "high", timeout: 0 });
    await expect.element(page.getByRole("alert")).toHaveTextContent("Order rejected");
  });

  test("F6 then Tab reach it, Tab its close button, and Enter closes it", async () => {
    const raised = await focusedToast("Report queued");
    await userEvent.tab();
    await expect
      .element(notifications.getByRole("button", { name: "Close notification" }))
      .toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(raised).not.toBeInTheDocument();
  });

  test("Escape closes the focused toast", async () => {
    const raised = await focusedToast("Report queued");
    await userEvent.keyboard("{Escape}");
    await expect.element(raised).not.toBeInTheDocument();
  });

  test("an action shows as a button that runs it", async () => {
    let undone = 0;
    await render(<Toaster />);
    toast.add({
      title: "Order cancelled",
      timeout: 0,
      actionProps: {
        children: "Undo",
        onClick: () => {
          undone += 1;
        },
      },
    });
    await notifications.getByRole("button", { name: "Undo" }).click();
    expect(undone).toBe(1);
  });
});

describe("Toast, its look by type", () => {
  test("each type looks different from every other, and error looks like destructive", async () => {
    const manager = createToastManager();
    await render(<Toaster toastManager={manager} limit={10} />);
    for (const type of [...types, "error"]) {
      manager.add({ title: type, type, timeout: 0 });
    }
    const looks = await Promise.all(types.map(async (type) => lookOf(await shownToast(type))));
    expect(new Set(looks).size).toBe(types.length);
    expect(lookOf(await shownToast("error"))).toBe(lookOf(await shownToast("destructive")));
  });

  test.each(statuses)(
    "a %s toast and its description are its status colour on its -subtle tint",
    async (status) => {
      const manager = createToastManager();
      await render(<Toaster toastManager={manager} />);
      manager.add({ title: "Status", description: "Detail", type: status, timeout: 0 });
      const raised = await shownToast("Status");
      expect(getComputedStyle(raised).backgroundColor).toBe(
        computedColour(`var(--${status}-subtle)`),
      );
      expect(getComputedStyle(notifications.getByText("Detail").element()).color).toBe(
        computedColour(`var(--${status})`),
      );
    },
  );

  test.each(statuses)("a %s toast shows an icon in its status colour", async (status) => {
    const manager = createToastManager();
    await render(<Toaster toastManager={manager} />);
    manager.add({ title: "Status", type: status, timeout: 0 });
    const icon = iconOf(await shownToast("Status"));
    expect(icon).not.toBeNull();
    expect(icon === null ? "" : getComputedStyle(icon).color).toBe(
      computedColour(`var(--${status})`),
    );
  });

  test("a plain toast has no icon", async () => {
    const manager = createToastManager();
    await render(<Toaster toastManager={manager} />);
    manager.add({ title: "Report queued", timeout: 0 });
    expect(iconOf(await shownToast("Report queued"))).toBeNull();
  });

  test("toast.promise shows a turning loader while it waits, which holds still under reduced motion", async () => {
    await promiseToast();
    const loader = iconOf(await shownToast("Pricing the portfolio"));
    const animation = (): string => (loader === null ? "" : getComputedStyle(loader).animationName);
    let reducedAnimation = "";
    withReducedMotion(() => {
      reducedAnimation = animation();
    });
    expect([animation(), reducedAnimation]).toStrictEqual(["spin", "none"]);
  });

  test("toast.promise's toast turns into its success when the promise resolves", async () => {
    const { resolve, shown } = await promiseToast();
    await shownToast("Pricing the portfolio");
    resolve("1,204 positions");
    await expect(shown).resolves.toBe("1,204 positions");
    const priced = await shownToast("Portfolio priced");
    expect(priced.dataset["variant"]).toBe("success");
  });

  test("its close and action buttons stay at least 24 px across in the compact density", async () => {
    await inCompactDensity(async () => {
      await render(<Toaster />);
      toast.add({ title: "Order cancelled", timeout: 0, actionProps: { children: "Undo" } });
      const raised = await shownToast("Order cancelled");
      const buttons = [...raised.querySelectorAll("button")];
      expect(buttons.map((button) => button.textContent || button.ariaLabel)).toStrictEqual([
        "Undo",
        "Close notification",
      ]);
      for (const button of buttons) {
        const box = button.getBoundingClientRect();
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
      }
    });
  });
});
