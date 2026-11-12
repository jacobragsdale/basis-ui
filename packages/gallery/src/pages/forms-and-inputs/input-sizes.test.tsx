/* One vocabulary of sizes: every input takes Select's two, `default` and `sm`, and stands as tall as a select of the
 * same size, so a dense filter row lines up whatever its controls are. */

import "#styles.css";

import {
  AmountInput,
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  DatePicker,
  Input,
  NumberField,
  Select,
  SelectTrigger,
  SelectValue,
} from "@basis/ui";
import type { ReactElement } from "react";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

type Size = "default" | "sm";

/** Each input at one size, each in a box named for it, beside a select's trigger of that size. */
function Inputs({ size }: { readonly size: Size }): ReactElement {
  return (
    <div className="flex flex-col items-start gap-2">
      <div data-control="select">
        <Select items={[{ label: "Rates", value: "rates" }]}>
          <SelectTrigger size={size} aria-label="Book">
            <SelectValue />
          </SelectTrigger>
        </Select>
      </div>
      <div data-control="input">
        <Input size={size} aria-label="Name" />
      </div>
      <div data-control="amount">
        <AmountInput size={size} aria-label="Par" />
      </div>
      <div data-control="date">
        <DatePicker size={size} aria-label="Maturity" />
      </div>
      <div data-control="number">
        <NumberField size={size} aria-label="Days" defaultValue={30} />
      </div>
      <div data-control="combobox">
        <Combobox items={["Treasury"]}>
          <ComboboxInput size={size} aria-label="Issuer" />
          <ComboboxContent>
            <ComboboxList>
              {(issuer: string) => (
                <ComboboxItem key={issuer} value={issuer}>
                  {issuer}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    </div>
  );
}

/** The height of the outlined box in each control's slot: the input, or the group around it. */
function heights(): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...document.querySelectorAll<HTMLElement>("[data-control]")].map((slot) => {
      const box = slot.querySelector<HTMLElement>(
        '[data-slot="input-group"], [data-slot="input"], [data-slot="select-trigger"]',
      );
      return [slot.dataset["control"] ?? "", box?.getBoundingClientRect().height ?? 0];
    }),
  );
}

describe("every input's size", () => {
  test.each(["default", "sm"] as const)(
    "%s: each input stands as tall as a select of that size",
    async (size) => {
      const screen = await render(<Inputs size={size} />);
      await expect.element(screen.getByRole("textbox", { name: "Name" })).toBeVisible();
      const measured = heights();
      const { select } = measured;
      expect(select).toBeGreaterThan(0);
      expect(
        Object.values(measured).every((height) => height === select),
        JSON.stringify(measured),
      ).toBe(true);
    },
  );

  test("the small size is shorter than the default, or the same where the 24 px target sets both", async () => {
    await render(<Inputs size="default" />);
    const tall = heights()["input"] ?? 0;
    document.body.replaceChildren();
    await render(<Inputs size="sm" />);
    expect(heights()["input"]).toBeLessThanOrEqual(tall);
  });
});
