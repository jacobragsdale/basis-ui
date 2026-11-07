/* The copies of clsx and cva in src/vendor behave as the packages they came from. The classes are real Tailwind
 * classes because `@shadcn/lint` checks every string passed to clsx and cva. */

import { describe, expect, test } from "vite-plus/test";

import { clsx } from "#vendor/clsx/clsx.ts";
import { cva } from "#vendor/cva/cva.ts";

describe(clsx, () => {
  test("joins strings and numbers in order, by single spaces", () => {
    expect(clsx("flex", 1, "grid")).toBe("flex 1 grid");
  });

  test("skips falsy values, booleans and bigints", () => {
    expect(clsx("", 0, Number.NaN, null, undefined, false, true, 1n, "flex")).toBe("flex");
  });

  test("reads arrays in order, nested to any depth", () => {
    expect(clsx(["flex", ["grid", ["block", null, ""]], []], "hidden")).toBe(
      "flex grid block hidden",
    );
  });

  test("keeps each dictionary key whose value is truthy", () => {
    expect(
      clsx({
        block: 1,
        contents: "",
        flex: true,
        grid: false,
        hidden: 0,
        inline: "yes",
        table: null,
      }),
    ).toBe("block flex inline");
  });

  test("an empty key adds a space only after another name, as clsx does", () => {
    expect(clsx({ "": true, flex: true })).toBe("flex");
    expect(clsx({ flex: true, "": true, grid: true })).toBe("flex  grid");
  });

  test("keeps a dictionary's inherited enumerable keys, as clsx does", () => {
    const dictionary: Record<string, unknown> = { flex: 1 };
    Object.setPrototypeOf(dictionary, { grid: true });
    expect(clsx(dictionary)).toBe("flex grid");
  });

  test("adds no space for a value that gives no class", () => {
    expect(clsx("flex", [], {}, null, "grid")).toBe("flex grid");
    expect(clsx()).toBe("");
  });

  test("neither trims nor removes duplicates", () => {
    expect(clsx("flex", "flex", " grid ")).toBe("flex flex  grid ");
  });
});

describe(cva, () => {
  const button = cva("rounded-md", {
    compoundVariants: [
      { className: "font-bold", size: "sm", tone: "danger" },
      { class: "font-normal", tone: ["muted", "plain"] },
    ],
    defaultVariants: { size: "md", tone: "plain" },
    variants: {
      size: { md: "h-8", sm: "h-6" },
      tone: {
        danger: "text-destructive",
        muted: "text-muted-foreground",
        plain: "text-foreground",
      },
    },
  });

  test("without variants, gives the base and the call's own classes", () => {
    expect(cva("rounded-md")()).toBe("rounded-md");
    expect(cva("rounded-md")({ className: "mt-2" })).toBe("rounded-md mt-2");
    expect(cva("rounded-md")({ class: ["mt-2", { "mb-2": true }] })).toBe("rounded-md mt-2 mb-2");
    expect(cva()()).toBe("");
  });

  test("gives each variant's default when the call names none", () => {
    expect(button()).toBe("rounded-md h-8 text-foreground font-normal");
    expect(button({})).toBe("rounded-md h-8 text-foreground font-normal");
  });

  test("a variant the call names replaces its default, and undefined keeps the default", () => {
    expect(button({ size: "sm" })).toBe("rounded-md h-6 text-foreground font-normal");
    expect(button({ size: undefined, tone: "danger" })).toBe("rounded-md h-8 text-destructive");
  });

  test("an explicit null chooses no class for that variant, not even the default", () => {
    expect(button({ size: null })).toBe("rounded-md text-foreground font-normal");
  });

  test("a compound variant applies when every condition holds, a list matching any of its values", () => {
    expect(button({ size: "sm", tone: "danger" })).toBe(
      "rounded-md h-6 text-destructive font-bold",
    );
    expect(button({ tone: "muted" })).toBe("rounded-md h-8 text-muted-foreground font-normal");
    expect(button({ size: "md", tone: "danger" })).toBe("rounded-md h-8 text-destructive");
  });

  test("puts the call's class and className last", () => {
    expect(button({ className: "mt-2", tone: "danger" })).toBe(
      "rounded-md h-8 text-destructive mt-2",
    );
    expect(button({ class: "mt-2" })).toBe("rounded-md h-8 text-foreground font-normal mt-2");
  });

  test("reads boolean variants as the keys true and false, and 0 as the key 0", () => {
    const toggle = cva("", {
      defaultVariants: { level: 1, on: false },
      variants: {
        level: { 0: "z-0", 1: "z-10" },
        on: { false: "opacity-50", true: "opacity-100" },
      },
    });
    expect(toggle()).toBe("z-10 opacity-50");
    expect(toggle({ on: true })).toBe("z-10 opacity-100");
    expect(toggle({ level: 0, on: false })).toBe("z-0 opacity-50");
  });

  test("a variant with no value and no default gives no class, and the others still apply", () => {
    const loose = cva("rounded-md", {
      variants: { size: { sm: "h-6" }, tone: { plain: "text-foreground" } },
    });
    expect(loose({ size: "sm" })).toBe("rounded-md h-6");
  });
});
