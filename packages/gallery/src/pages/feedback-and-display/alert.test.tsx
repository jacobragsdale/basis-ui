import "#styles.css";

import { Alert, AlertDescription, AlertTitle, CircleCheckIcon } from "@basis/ui";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import { computedColour } from "./test-support.ts";

const variants = ["default", "success", "warning", "info", "destructive"] as const;
const statuses = ["success", "warning", "info", "destructive"] as const;
const roles = [
  ["default", "status"],
  ["success", "status"],
  ["info", "status"],
  ["warning", "alert"],
  ["destructive", "alert"],
] as const;

function SettledAlert(props: ComponentProps<typeof Alert>): ReactElement {
  return (
    <Alert {...props}>
      <CircleCheckIcon />
      <AlertTitle>Settlement confirmed</AlertTitle>
      <AlertDescription>All 42 trades for today settled with the custodian.</AlertDescription>
    </Alert>
  );
}

/** Two alerts of one width, one with an icon and one without, each with a description long enough to wrap. */
function AlertsWithAndWithoutIcon(): ReactElement {
  const text =
    "All 42 trades for today settled with the custodian, and the cash moved before noon.";
  return (
    <div className="flex w-80 flex-col gap-2">
      <Alert>
        <CircleCheckIcon data-testid="icon" />
        <AlertTitle data-testid="title">Settled</AlertTitle>
        <AlertDescription data-testid="description">{text}</AlertDescription>
      </Alert>
      <Alert>
        <AlertTitle data-testid="plain-title">Settled</AlertTitle>
        <AlertDescription data-testid="plain-description">{text}</AlertDescription>
      </Alert>
    </div>
  );
}

/** The box of the element with `testId`. */
function boxOf(testId: string): DOMRect {
  return page.getByTestId(testId).element().getBoundingClientRect();
}

describe("Alert", () => {
  test.each(roles)("the %s variant is a %s named by its title", async (variant, role) => {
    const screen = await render(<SettledAlert variant={variant} />);
    const alert = screen.getByRole(role, { name: "Settlement confirmed" });
    await expect.element(alert).toBeVisible();
    expect(alert.element().textContent).toContain("All 42 trades for today settled");
  });

  test("role overrides the variant's role", async () => {
    const screen = await render(<SettledAlert variant="success" role="alert" />);
    await expect.element(screen.getByRole("alert", { name: "Settlement confirmed" })).toBeVisible();
  });

  test("without a title it points at no name", async () => {
    const screen = await render(<Alert>Prices are end of day.</Alert>);
    const alert = screen.getByRole("status");
    await expect.element(alert).toHaveTextContent("Prices are end of day.");
    await expect.element(alert).not.toHaveAttribute("aria-labelledby");
  });

  test("each variant looks different from every other", async () => {
    const screen = await render(
      <>
        {variants.map((variant) => (
          <SettledAlert key={variant} variant={variant} data-testid={variant} />
        ))}
      </>,
    );
    const looks = variants.map((variant) => {
      const style = getComputedStyle(screen.getByTestId(variant).element());
      return [style.backgroundColor, style.color, style.borderColor].join(" ");
    });
    expect(new Set(looks).size).toBe(variants.length);
  });

  test.each(statuses)(
    "the %s variant's title and description are its status colour on its -subtle tint",
    async (status) => {
      const screen = await render(<SettledAlert variant={status} data-testid="alert" />);
      const colour = computedColour(`var(--${status})`);
      const alert = getComputedStyle(screen.getByTestId("alert").element());
      expect(alert.backgroundColor).toBe(computedColour(`var(--${status}-subtle)`));
      expect(getComputedStyle(screen.getByText("Settlement confirmed").element()).color).toBe(
        colour,
      );
      expect(
        getComputedStyle(
          screen.getByText("All 42 trades for today settled with the custodian.").element(),
        ).color,
      ).toBe(colour);
    },
  );

  test("an icon takes a column of its width, with the title and description beside it", async () => {
    await render(<AlertsWithAndWithoutIcon />);
    const icon = boxOf("icon");
    const title = boxOf("title");
    const description = boxOf("description");
    expect(icon.width).toBe(16);
    expect(title.left).toBeGreaterThan(icon.right);
    expect(description.left).toBe(title.left);
    expect(description.top).toBeGreaterThanOrEqual(title.bottom);
  });

  test("beside an icon, the text runs to the alert's edge, as it does with no icon", async () => {
    await render(<AlertsWithAndWithoutIcon />);
    expect(boxOf("description").right).toBe(boxOf("plain-description").right);
    expect(boxOf("plain-title").left).toBe(boxOf("icon").left);
  });
});
