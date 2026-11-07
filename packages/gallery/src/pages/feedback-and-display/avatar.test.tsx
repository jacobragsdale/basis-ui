import "#styles.css";

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

// A one-pixel PNG, which loads, and a URL that fails to.
const picture =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const broken = "data:image/png;base64,broken";

const sizes = [
  ["sm", 24],
  ["default", 32],
  ["lg", 40],
] as const;

describe("Avatar", () => {
  test("once the picture loads, it is an image named by its alt", async () => {
    const screen = await render(
      <Avatar>
        <AvatarImage src={picture} alt="Dana Reyes" />
        <AvatarFallback>DR</AvatarFallback>
      </Avatar>,
    );
    await expect.element(screen.getByRole("img", { name: "Dana Reyes" })).toBeVisible();
    await expect.element(screen.getByText("DR")).not.toBeInTheDocument();
  });

  test("a picture that fails to load leaves the fallback in its place", async () => {
    const screen = await render(
      <Avatar>
        <AvatarImage src={broken} alt="Dana Reyes" />
        <AvatarFallback>DR</AvatarFallback>
      </Avatar>,
    );
    await expect.element(screen.getByText("DR")).toBeVisible();
    await expect.element(screen.getByRole("img")).not.toBeInTheDocument();
  });

  test.each(sizes)("at size %s it is a %i px circle", async (size, side) => {
    const screen = await render(
      <Avatar size={size} data-testid="avatar">
        <AvatarFallback>JK</AvatarFallback>
      </Avatar>,
    );
    const avatar = screen.getByTestId("avatar").element();
    const box = avatar.getBoundingClientRect();
    expect([box.width, box.height]).toStrictEqual([side, side]);
    expect(getComputedStyle(avatar).borderTopLeftRadius).not.toBe("0px");
  });

  test("in a group, the avatars overlap and the count of the rest follows them", async () => {
    const screen = await render(
      <AvatarGroup>
        <Avatar data-testid="first">
          <AvatarFallback>DR</AvatarFallback>
        </Avatar>
        <Avatar data-testid="second">
          <AvatarFallback>JK</AvatarFallback>
        </Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>,
    );
    const first = screen.getByTestId("first").element().getBoundingClientRect();
    const second = screen.getByTestId("second").element().getBoundingClientRect();
    const count = screen.getByText("+3").element().getBoundingClientRect();
    expect(second.left).toBeLessThan(first.right);
    expect(count.left).toBeGreaterThan(second.left);
  });
});
