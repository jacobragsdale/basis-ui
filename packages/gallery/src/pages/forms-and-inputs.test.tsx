import "#styles.css";

import { Button, ButtonLink, PlusIcon } from "@basis/ui";
import type { ComponentProps, ReactElement } from "react";
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
        <PlusIcon />
      </Button>,
    );
    await expect.element(screen.getByRole("button", { name: "Add" })).toBeVisible();
  });

  test("disabled, it is a disabled button", async () => {
    const screen = await render(<Button disabled>Save</Button>);
    await expect.element(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("render swaps its element but keeps the button role, so links use ButtonLink", async () => {
    const screen = await render(<Button nativeButton={false} render={<span>Save</span>} />);
    await expect.element(screen.getByRole("button", { name: "Save" })).toBeVisible();
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
          <PlusIcon />
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
            <PlusIcon />
          </Button>,
        );
        const box = screen.getByRole("button", { name: "Add" }).element().getBoundingClientRect();
        expect(box.height).toBeGreaterThanOrEqual(24);
        expect(box.width).toBeGreaterThanOrEqual(24);
      });
    },
  );
});

/** A stand-in for a router's link component, which renders an `<a>` of its own. */
function RouterLink({
  to,
  children,
  ...props
}: ComponentProps<"a"> & { readonly to: string }): ReactElement {
  return (
    <a href={`#${to}`} data-router="true" {...props}>
      {children}
    </a>
  );
}

/** The computed look that tells one variant from another. */
function lookOf(element: Element): string {
  const style = getComputedStyle(element);
  return [style.backgroundColor, style.color, style.borderColor, style.height].join(" ");
}

describe("ButtonLink", () => {
  test("is a link named by its text, to its href, marked as a button with its variant and size", async () => {
    const screen = await render(
      <ButtonLink href="#positions" variant="outline" size="sm">
        Positions
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Positions" });
    await expect.element(link).toHaveAttribute("href", "#positions");
    await expect.element(link).toHaveAttribute("data-slot", "button");
    await expect.element(link).toHaveAttribute("data-variant", "outline");
    await expect.element(link).toHaveAttribute("data-size", "sm");
  });

  test("render makes it the router's link, which stays a link", async () => {
    const screen = await render(
      <ButtonLink variant="secondary" render={<RouterLink to="trades" />}>
        Trades
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Trades" });
    await expect.element(link).toHaveAttribute("href", "#trades");
    await expect.element(link).toHaveAttribute("data-router", "true");
    await expect.element(link).toHaveAttribute("data-variant", "secondary");
  });

  test.each(variants)("the %s variant looks like the Button of that variant", async (variant) => {
    const screen = await render(
      <>
        <Button variant={variant}>Save</Button>
        <ButtonLink href="#save" variant={variant}>
          Save
        </ButtonLink>
      </>,
    );
    const button = screen.getByRole("button", { name: "Save" }).element();
    const link = screen.getByRole("link", { name: "Save" }).element();
    expect(lookOf(link)).toBe(lookOf(button));
  });

  test.each(textSizes)(
    "the %s size is %i px tall in the comfortable density",
    async (size, height) => {
      const screen = await render(
        <ButtonLink href="#save" size={size}>
          Save
        </ButtonLink>,
      );
      const box = screen.getByRole("link", { name: "Save" }).element().getBoundingClientRect();
      expect(box.height).toBe(height);
    },
  );

  test.each(allSizes)(
    "the %s size stays at least 24 px across in the compact density, WCAG 2.2's minimum target",
    async (size) => {
      await inCompactDensity(async () => {
        const screen = await render(
          <ButtonLink href="#add" size={size} aria-label="Add">
            <PlusIcon />
          </ButtonLink>,
        );
        const box = screen.getByRole("link", { name: "Add" }).element().getBoundingClientRect();
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

  test("shows a ButtonLink of every variant and every size", async () => {
    const screen = await render(<FormsAndInputs />);
    const links = screen.container.querySelectorAll<HTMLElement>('a[data-slot="button"]');
    const shownVariants = new Set([...links].map((link) => link.dataset["variant"]));
    const shownSizes = new Set([...links].map((link) => link.dataset["size"]));
    for (const variant of variants) {
      expect(shownVariants, variant).toContain(variant);
    }
    for (const size of allSizes) {
      expect(shownSizes, size).toContain(size);
    }
  });
});
