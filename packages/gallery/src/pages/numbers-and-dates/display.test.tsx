import "#styles.css";

import { Bps, DateTime, Money, Num, Pct, Price32 } from "@basis/ui";
import { Decimal } from "@basis/ui/numbers";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { computedColour, inMode } from "./test-helpers.ts";

/** Renders `element` and returns the text it shows. */
async function shownText(element: ReactElement): Promise<string> {
  const screen = await render(element);
  return screen.container.textContent;
}

describe("the display components' text", () => {
  test.each([
    { element: <Num value="1234.50" />, name: "Num, decimal text", text: "1,234.50" },
    { element: <Num value={-1234.5} />, name: "Num, a negative double", text: "-1,234.50" },
    { element: <Num value={1_234_567n} />, name: "Num, a bigint", text: "1,234,567" },
    {
      element: <Num value={Decimal.from("-0.250")} />,
      name: "Num, a Decimal from @basis/ui/numbers",
      text: "-0.250",
    },
    { element: <Num value="1500000" abbreviate="M" />, name: "Num, abbreviated", text: "1.5M" },
    {
      element: <Num value="-12.5" negative="parentheses" />,
      name: "Num, in parentheses",
      text: "(12.5)",
    },
    { element: <Num value={null} />, name: "Num, null", text: "" },
    { element: <Money value="1234.5" />, name: "Money", text: "$1,234.50" },
    { element: <Money value="-1234.5" />, name: "Money, negative", text: "-$1,234.50" },
    { element: <Money value="1234.5" currency="EUR" />, name: "Money in euros", text: "€1,234.50" },
    { element: <Money value={undefined} />, name: "Money, undefined", text: "" },
    { element: <Pct value="0.0525" />, name: "Pct", text: "5.25%" },
    { element: <Pct value={-0.0012} />, name: "Pct, negative", text: "-0.12%" },
    { element: <Pct value={0.0525} />, name: "Pct, a double", text: "5.25%" },
    { element: <Bps value="0.0025" />, name: "Bps", text: "25\u00A0bp" },
    { element: <Bps value="-0.00125" />, name: "Bps, negative", text: "-12.5\u00A0bp" },
    { element: <Bps value={0.0125} />, name: "Bps, a double", text: "125.00\u00A0bp" },
    { element: <Price32 value="99.515625" />, name: "Price32, a half", text: "99-16+" },
    { element: <Price32 value="99.5078125" />, name: "Price32, an eighth", text: "99-162" },
    { element: <Price32 value={101.25} />, name: "Price32, a double", text: "101-08" },
    { element: <Price32 value="-0.140625" />, name: "Price32, negative", text: "-0-04+" },
    {
      element: <Price32 value="99.515625" precision="thirty-seconds" />,
      name: "Price32 in whole 32nds",
      text: "99-17",
    },
    { element: <Price32 value={null} />, name: "Price32, null", text: "" },
    {
      element: <DateTime value="2026-11-06T14:30:00Z" />,
      name: "DateTime, in New York",
      text: "2026-11-06 09:30:00",
    },
    {
      element: <DateTime value="2026-07-01T14:30:00.123456Z" precision="milliseconds" />,
      name: "DateTime, in summer, to the millisecond",
      text: "2026-07-01 10:30:00.123",
    },
    {
      element: <DateTime value={Temporal.PlainDate.from("2026-11-06")} />,
      name: "DateTime, a date",
      text: "2026-11-06",
    },
    { element: <DateTime value={null} />, name: "DateTime, null", text: "" },
  ])("$name shows $text", async ({ element, text }) => {
    expect(await shownText(element)).toBe(text);
  });
});

describe("signed values", () => {
  test.each([
    { element: <Num value="1250.5" signed />, name: "Num gain", text: "+1,250.5" },
    { element: <Money value="-1234.5" signed />, name: "Money loss", text: "-$1,234.50" },
    { element: <Pct value={0.0003} signed />, name: "Pct gain", text: "+0.03%" },
    { element: <Bps value="-0.0003" signed />, name: "Bps loss", text: "-3\u00A0bp" },
    { element: <Price32 value="0.140625" signed />, name: "Price32 gain", text: "+0-04+" },
    {
      element: <Num value="-12" negative="parentheses" signed />,
      name: "a loss in parentheses",
      text: "(12)",
    },
    {
      element: <Num value="0.001" decimals={2} signed />,
      name: "a zero once rounded",
      text: "0.00",
    },
  ])("$name shows $text, always with its sign", async ({ element, text }) => {
    expect(await shownText(element)).toBe(text);
  });

  test("a gain is drawn in the gain colour, a loss in the loss colour, and zero in neither", async () => {
    const screen = await render(
      <>
        <Num value="1" signed data-testid="gain" />
        <Num value="-1" signed data-testid="loss" />
        <Num value="0" signed data-testid="zero" />
      </>,
    );
    const colourOf = (id: string): string =>
      getComputedStyle(screen.getByTestId(id).element()).color;
    expect(colourOf("gain")).toBe(computedColour("var(--gain)"));
    expect(colourOf("loss")).toBe(computedColour("var(--loss)"));
    expect(colourOf("zero")).toBe(computedColour("var(--foreground)"));
    await expect.element(screen.getByTestId("gain")).toHaveAttribute("data-direction", "gain");
    await expect.element(screen.getByTestId("zero")).toHaveAttribute("data-direction", "none");
  });

  test("in the dark mode a gain takes the dark mode's own gain colour", async () => {
    const light = computedColour("var(--gain)");
    await inMode("dark", async () => {
      const screen = await render(<Num value="1" signed data-testid="gain" />);
      const dark = computedColour("var(--gain)");
      expect(getComputedStyle(screen.getByTestId("gain").element()).color).toBe(dark);
      expect(dark).not.toBe(light);
    });
  });

  test("an unsigned value takes no colour and no plus sign", async () => {
    const screen = await render(<Num value="1" data-testid="plain" />);
    await expect.element(screen.getByTestId("plain")).toHaveTextContent("1");
    await expect.element(screen.getByTestId("plain")).not.toHaveAttribute("data-direction");
  });
});

describe("figures", () => {
  test("are tabular, so digits line up by place", async () => {
    const screen = await render(
      <>
        <Money value="1" data-testid="money" />
        <DateTime value="2026-11-06" data-testid="time" />
      </>,
    );
    for (const id of ["money", "time"]) {
      expect(getComputedStyle(screen.getByTestId(id).element()).fontVariantNumeric, id).toBe(
        "tabular-nums",
      );
    }
  });

  test("align to the right when asked, and to the start otherwise", async () => {
    const screen = await render(
      <div className="w-64">
        <Pct value="0.05" align="end" data-testid="end" />
        <Pct value="0.05" data-testid="start" />
      </div>,
    );
    const end = getComputedStyle(screen.getByTestId("end").element());
    expect([end.display, end.textAlign]).toStrictEqual(["block", "right"]);
    expect(getComputedStyle(screen.getByTestId("start").element()).display).toBe("inline");
  });
});

describe("DateTime", () => {
  test("is a time element whose dateTime is the instant and whose title gives it in full", async () => {
    const screen = await render(<DateTime value="2026-11-06T14:30:00.5Z" data-testid="time" />);
    const time = screen.getByTestId("time");
    expect(time.element().tagName).toBe("TIME");
    await expect.element(time).toHaveAttribute("datetime", "2026-11-06T14:30:00.5Z");
    await expect
      .element(time)
      .toHaveAttribute("title", "2026-11-06T09:30:00.5-05:00[America/New_York]");
  });

  test("takes a Temporal instant and another zone", async () => {
    const instant = Temporal.Instant.from("2026-11-06T14:30:00Z");
    expect(await shownText(<DateTime value={instant} zone="Asia/Tokyo" />)).toBe(
      "2026-11-06 23:30:00",
    );
  });
});
