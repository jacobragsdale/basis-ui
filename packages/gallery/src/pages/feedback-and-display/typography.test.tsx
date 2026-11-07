import "#styles.css";

import {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLead,
  TypographyList,
  TypographyMuted,
  TypographyP,
} from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { computedColour, pixels } from "./test-support.ts";

/** An element's computed font size in pixels. */
function fontSize(element: Element): number {
  return pixels(getComputedStyle(element).fontSize);
}

describe("Typography", () => {
  test("each heading is a heading at its level, named by its text, a step smaller than the one before", async () => {
    const screen = await render(
      <>
        <TypographyH1>Morning note</TypographyH1>
        <TypographyH2>Overnight</TypographyH2>
        <TypographyH3>Risk</TypographyH3>
        <TypographyH4>Calendar</TypographyH4>
      </>,
    );
    const headings = (
      [
        [1, "Morning note"],
        [2, "Overnight"],
        [3, "Risk"],
        [4, "Calendar"],
      ] as const
    ).map(([level, name]) => screen.getByRole("heading", { level, name }));
    await Promise.all(headings.map(async (heading) => expect.element(heading).toBeVisible()));
    const sizes = headings.map((heading) => fontSize(heading.element()));
    expect(sizes).toStrictEqual(sizes.toSorted((larger, smaller) => smaller - larger));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  test("render changes a heading's level but keeps its look", async () => {
    const screen = await render(
      <>
        <TypographyH2>Overnight</TypographyH2>
        <TypographyH2 render={<h3>Risk</h3>} />
      </>,
    );
    const h2 = screen.getByRole("heading", { level: 2, name: "Overnight" }).element();
    const h3 = screen.getByRole("heading", { level: 3, name: "Risk" }).element();
    expect(fontSize(h3)).toBe(fontSize(h2));
    expect(getComputedStyle(h3).borderBottomWidth).toBe(getComputedStyle(h2).borderBottomWidth);
  });

  test("a paragraph is 14 px body text in the text colour", async () => {
    const screen = await render(<TypographyP>Body</TypographyP>);
    const body = screen.getByText("Body").element();
    expect(body.tagName).toBe("P");
    expect(fontSize(body)).toBe(14);
    expect(getComputedStyle(body).color).toBe(computedColour("var(--foreground)"));
  });

  test("the lead is a larger paragraph, and muted text one at body size, both muted", async () => {
    const screen = await render(
      <>
        <TypographyLead>Lead</TypographyLead>
        <TypographyMuted>Muted</TypographyMuted>
      </>,
    );
    const lead = screen.getByText("Lead").element();
    const muted = screen.getByText("Muted").element();
    expect([lead.tagName, muted.tagName]).toStrictEqual(["P", "P"]);
    expect([fontSize(lead), fontSize(muted)]).toStrictEqual([16, 14]);
    const mutedColour = computedColour("var(--muted-foreground)");
    expect([getComputedStyle(lead).color, getComputedStyle(muted).color]).toStrictEqual([
      mutedColour,
      mutedColour,
    ]);
  });

  test("inline code is a code element in the monospaced font, on the muted surface", async () => {
    const screen = await render(
      <TypographyP>
        The <TypographyInlineCode>UST10Y</TypographyInlineCode> position.
      </TypographyP>,
    );
    const code = screen.getByText("UST10Y").element();
    expect(code.tagName).toBe("CODE");
    expect(getComputedStyle(code).fontFamily).toContain("JetBrains Mono");
    expect(getComputedStyle(code).backgroundColor).toBe(computedColour("var(--muted)"));
  });

  test("a list is a bulleted list of its items", async () => {
    const screen = await render(
      <TypographyList>
        <li>DV01 within its limit</li>
        <li>No concentration breaches</li>
      </TypographyList>,
    );
    const list = screen.getByRole("list");
    expect(list.getByRole("listitem").all()).toHaveLength(2);
    expect(getComputedStyle(list.element()).listStyleType).toBe("disc");
  });
});
