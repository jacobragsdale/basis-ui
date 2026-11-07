import "#styles.css";

import { Button, buttonVariants } from "@basis/ui";
import { Plus } from "lucide-react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { FormsAndInputs } from "./forms-and-inputs.tsx";

const variants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

// Each size's height on the comfortable density's 4 px spacing unit. The icon sizes are squares of the same side.
const textSizes = [
  ["xs", 24],
  ["sm", 28],
  ["default", 32],
  ["lg", 36],
] as const;
const iconSizes = [
  ["icon-xs", 24],
  ["icon-sm", 28],
  ["icon", 32],
  ["icon-lg", 36],
] as const;
const allSizes = [...textSizes, ...iconSizes].map(([size]) => size);

/** Runs `check` with the page in the compact density, then puts the comfortable density back. */
async function inCompactDensity(check: () => Promise<void>): Promise<void> {
  document.documentElement.dataset["density"] = "compact";
  try {
    await check();
  } finally {
    delete document.documentElement.dataset["density"];
  }
}

describe("Button", () => {
  test("is a button named by its text", async () => {
    const screen = await render(<Button>Save</Button>);
    await expect.element(screen.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("an icon button is named by its aria-label", async () => {
    const screen = await render(
      <Button size="icon" aria-label="Add">
        <Plus />
      </Button>,
    );
    await expect.element(screen.getByRole("button", { name: "Add" })).toBeVisible();
  });

  test("disabled, it is a disabled button", async () => {
    const screen = await render(<Button disabled>Save</Button>);
    await expect.element(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("render swaps its element but keeps the button role, so links use buttonVariants", async () => {
    const screen = await render(<Button nativeButton={false} render={<span>Save</span>} />);
    await expect.element(screen.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("buttonVariants draws a link as a button, and it stays a link", async () => {
    const screen = await render(
      <a href="#positions" className={buttonVariants({ variant: "outline" })}>
        Positions
      </a>,
    );
    const link = screen.getByRole("link", { name: "Positions" });
    await expect.element(link).toHaveAttribute("href", "#positions");
    expect(link.element().getBoundingClientRect().height).toBe(32);
  });

  test.each(variants)("the %s variant is a button named by its text", async (variant) => {
    const screen = await render(<Button variant={variant}>Save</Button>);
    await expect.element(screen.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("each variant looks different from every other", async () => {
    const screen = await render(
      <>
        {variants.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </>,
    );
    const looks = variants.map((variant) => {
      const style = getComputedStyle(screen.getByRole("button", { name: variant }).element());
      return [style.backgroundColor, style.color, style.borderColor].join(" ");
    });
    expect(new Set(looks).size).toBe(variants.length);
  });

  test.each(textSizes)(
    "the %s size is %i px tall in the comfortable density",
    async (size, height) => {
      const screen = await render(<Button size={size}>Save</Button>);
      const box = screen.getByRole("button", { name: "Save" }).element().getBoundingClientRect();
      expect(box.height).toBe(height);
    },
  );

  test.each(iconSizes)(
    "the %s size is a %i px square in the comfortable density",
    async (size, side) => {
      const screen = await render(
        <Button size={size} aria-label="Add">
          <Plus />
        </Button>,
      );
      const box = screen.getByRole("button", { name: "Add" }).element().getBoundingClientRect();
      expect([box.width, box.height]).toStrictEqual([side, side]);
    },
  );

  test.each(allSizes)(
    "the %s size stays at least 24 px across in the compact density, WCAG 2.2's minimum target",
    async (size) => {
      await inCompactDensity(async () => {
        const screen = await render(
          <Button size={size} aria-label="Add">
            <Plus />
          </Button>,
        );
        const box = screen.getByRole("button", { name: "Add" }).element().getBoundingClientRect();
        expect(box.height).toBeGreaterThanOrEqual(24);
        expect(box.width).toBeGreaterThanOrEqual(24);
      });
    },
  );
});

describe("the forms and inputs page", () => {
  test("shows every Button variant at every size", async () => {
    const screen = await render(<FormsAndInputs />);
    const perVariant = variants.length * textSizes.length;
    expect(screen.getByRole("button", { name: "Save" }).all()).toHaveLength(perVariant);
    expect(screen.getByRole("button", { name: "Add" }).all()).toHaveLength(perVariant);
  });
});
