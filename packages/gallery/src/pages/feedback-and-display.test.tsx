import "#styles.css";

import { Badge, CircleCheckIcon } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { FeedbackAndDisplay } from "./feedback-and-display.tsx";

const variants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "link",
  "success",
  "warning",
  "info",
  "destructive",
] as const;
const statuses = ["success", "warning", "info", "destructive"] as const;

/** A colour as the browser computes it, so it compares with a computed style. */
function computedColour(value: string): string {
  const probe = document.createElement("div");
  probe.style.color = value;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}

describe("Badge", () => {
  test("is a span holding its text, marked as a badge with its variant", async () => {
    const screen = await render(<Badge variant="success">Settled</Badge>);
    const badge = screen.getByText("Settled");
    await expect.element(badge).toBeVisible();
    expect(badge.element().tagName).toBe("SPAN");
    await expect.element(badge).toHaveAttribute("data-slot", "badge");
    await expect.element(badge).toHaveAttribute("data-variant", "success");
  });

  test("render makes it a link, named by the link's text", async () => {
    const screen = await render(<Badge variant="outline" render={<a href="#trades">Trades</a>} />);
    await expect
      .element(screen.getByRole("link", { name: "Trades" }))
      .toHaveAttribute("href", "#trades");
  });

  test("an icon beside the word leaves the word as its text", async () => {
    const screen = await render(
      <Badge variant="success">
        <CircleCheckIcon data-icon="inline-start" />
        Settled
      </Badge>,
    );
    await expect.element(screen.getByText("Settled")).toHaveTextContent("Settled");
  });

  test("each variant looks different from every other", async () => {
    const screen = await render(
      <>
        {variants.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </>,
    );
    const looks = variants.map((variant) => {
      const style = getComputedStyle(screen.getByText(variant, { exact: true }).element());
      return [style.backgroundColor, style.color, style.borderColor].join(" ");
    });
    expect(new Set(looks).size).toBe(variants.length);
  });

  test.each(statuses)(
    "the %s variant is its status colour on its status's -subtle tint",
    async (status) => {
      const screen = await render(<Badge variant={status}>Status</Badge>);
      const style = getComputedStyle(screen.getByText("Status").element());
      expect(style.backgroundColor).toBe(computedColour(`var(--${status}-subtle)`));
      expect(style.color).toBe(computedColour(`var(--${status})`));
    },
  );
});

/** The values of `attribute` on the page's elements of a slot, such as each Alert's `data-variant`. */
function shown(container: HTMLElement, slot: string, attribute: string): Set<string | null> {
  const elements = container.querySelectorAll(`[data-slot="${slot}"]`);
  return new Set([...elements].map((element) => element.getAttribute(attribute)));
}

const sections = [
  "Alert",
  "Toast",
  "Badge",
  "Avatar",
  "Kbd",
  "Progress",
  "Spinner",
  "Skeleton",
  "Empty",
  "Table",
  "Typography",
] as const;

describe("the feedback and display page", () => {
  test("has a section for each component, named by its heading", async () => {
    const screen = await render(<FeedbackAndDisplay />);
    await Promise.all(
      sections.map(async (name) =>
        expect.element(screen.getByRole("region", { name, exact: true })).toBeVisible(),
      ),
    );
  });

  test("shows every Badge variant", async () => {
    const screen = await render(<FeedbackAndDisplay />);
    for (const variant of variants) {
      expect(shown(screen.container, "badge", "data-variant"), variant).toContain(variant);
    }
  });

  test("shows every variant of Alert, Empty and Skeleton, every Avatar size, and numeric table cells", async () => {
    const screen = await render(<FeedbackAndDisplay />);
    const expected = [
      ["alert", "data-variant", ["default", ...statuses]],
      ["empty", "data-variant", ["default", "outline"]],
      ["empty-icon", "data-variant", ["default", "icon"]],
      ["skeleton", "data-variant", ["default", "circle"]],
      ["avatar", "data-size", ["sm", "default", "lg"]],
      ["table-head", "data-variant", ["default", "numeric"]],
      ["table-cell", "data-variant", ["default", "numeric"]],
    ] as const;
    for (const [slot, attribute, values] of expected) {
      const found = shown(screen.container, slot, attribute);
      for (const value of values) {
        expect(found, `${slot} ${value}`).toContain(value);
      }
    }
  });

  test("its Toast buttons raise a toast of each variant", async () => {
    const screen = await render(<FeedbackAndDisplay />);
    const labels = ["Default", "Success", "Warning", "Info", "Destructive"] as const;
    for (const label of labels) {
      const button = screen.getByRole("button", { name: label, exact: true }).element();
      if (button instanceof HTMLElement) {
        button.click();
      }
    }
    await expect
      .element(screen.getByRole("dialog", { name: "Order rejected" }))
      .toHaveAttribute("data-variant", "destructive");
    const raised = shown(document.body, "toast", "data-variant");
    for (const variant of ["default", ...statuses]) {
      expect(raised, variant).toContain(variant);
    }
  });
});
