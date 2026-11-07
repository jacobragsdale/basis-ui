import "#styles.css";

import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  fieldErrors,
} from "@basis/ui";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-react";

import { FieldSection, LabelSection } from "./fields.tsx";
import { computedColour } from "./test-helpers.ts";

const orientations = ["vertical", "horizontal", "responsive"] as const;

describe("Label", () => {
  test("names the control its htmlFor points at", async () => {
    const screen = await render(<LabelSection />);
    await expect.element(screen.getByRole("textbox", { name: "Trader" })).toBeVisible();
    await expect
      .element(screen.getByRole("checkbox", { name: "Send a confirmation" }))
      .toBeVisible();
  });

  test("dims beside a disabled control", async () => {
    const screen = await render(<LabelSection />);
    const locked = screen.getByText("Locked by compliance").element();
    const open = screen.getByText("Send a confirmation").element();
    expect(getComputedStyle(locked).opacity).toBe("0.5");
    expect(getComputedStyle(open).opacity).toBe("1");
  });
});

describe("Field", () => {
  test("is a group whose label names its control and whose description describes it", async () => {
    const screen = await render(<FieldSection />);
    const input = screen.getByRole("textbox", { name: "Counterparty" });
    await expect.element(input).toBeVisible();
    expect(input.element().closest('[role="group"][data-slot="field"]')).not.toBeNull();
  });

  test.each(orientations)("the %s orientation is marked on the field", async (orientation) => {
    const screen = await render(
      <Field orientation={orientation}>
        <FieldLabel htmlFor="book">Book</FieldLabel>
        <Input id="book" />
      </Field>,
    );
    const field = screen.container.querySelector<HTMLElement>('[data-slot="field"]');
    expect(field?.dataset["orientation"]).toBe(orientation);
  });

  test("vertical lays the label above the control, and horizontal beside it", async () => {
    const screen = await render(
      <>
        <Field orientation="vertical" data-testid="vertical">
          <FieldLabel htmlFor="above">Above</FieldLabel>
          <Input id="above" />
        </Field>
        <Field orientation="horizontal" data-testid="horizontal">
          <FieldLabel htmlFor="beside">Beside</FieldLabel>
          <Input id="beside" />
        </Field>
      </>,
    );
    expect(getComputedStyle(screen.getByTestId("vertical").element()).flexDirection).toBe("column");
    expect(getComputedStyle(screen.getByTestId("horizontal").element()).flexDirection).toBe("row");
  });

  test("invalid, its label takes the destructive colour and its error is an alert in words", async () => {
    const screen = await render(<FieldSection />);
    const label = screen.getByText("Quantity", { exact: true }).element();
    expect(getComputedStyle(label).color).toBe(computedColour("var(--destructive)"));
    const input = screen.getByRole("textbox", { name: "Quantity" });
    await expect.element(input).toHaveAccessibleDescription("Enter a quantity above zero.");
    await expect
      .element(screen.getByRole("alert").filter({ hasText: "Enter a quantity above zero." }))
      .toBeVisible();
  });

  test("its legend's variants differ in size, and name the fieldset", async () => {
    const screen = await render(
      <>
        <FieldSet>
          <FieldLegend>Settlement</FieldLegend>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">Day count</FieldLegend>
        </FieldSet>
      </>,
    );
    await expect.element(screen.getByRole("group", { name: "Settlement" })).toBeVisible();
    const legend = getComputedStyle(screen.getByText("Settlement").element()).fontSize;
    const label = getComputedStyle(screen.getByText("Day count").element()).fontSize;
    expect([legend, label]).toStrictEqual(["16px", "14px"]);
  });

  test("a choice card's label tints while its radio is chosen", async () => {
    const screen = await render(<FieldSection />);
    const chosen = screen.getByRole("radio", { name: /^T\+1/u }).element().closest("label");
    const other = screen
      .getByRole("radio", { name: /^Same day/u })
      .element()
      .closest("label");
    expect(chosen === null || other === null).toBe(false);
    if (chosen !== null && other !== null) {
      expect(getComputedStyle(chosen).backgroundColor).not.toBe(
        getComputedStyle(other).backgroundColor,
      );
    }
  });
});

describe("FieldError", () => {
  test("shows one error as a line", async () => {
    const screen = await render(<FieldError errors={[{ message: "Enter a price." }]} />);
    await expect.element(screen.getByRole("alert")).toHaveTextContent("Enter a price.");
    expect(screen.container.querySelector("li")).toBeNull();
  });

  test("shows several as a list, each message once", async () => {
    const screen = await render(
      <FieldError
        errors={["Use capital letters.", { message: "Use capital letters." }, "Too long."]}
      />,
    );
    const items = screen.getByRole("listitem").all();
    expect(items.map((item) => item.element().textContent)).toStrictEqual([
      "Use capital letters.",
      "Too long.",
    ]);
  });

  test("renders nothing without an error", async () => {
    const screen = await render(<FieldError errors={[undefined]} />);
    expect(screen.container.querySelector('[data-slot="field-error"]')).toBeNull();
  });

  test("shows a 422's errors on the fields their pointers name, through fieldErrors", async () => {
    const byField = fieldErrors({
      errors: [
        { detail: "No such bond.", pointer: "#/cusip" },
        { detail: "Above the desk's limit.", pointer: "#/quantity" },
      ],
      status: 422,
      type: "about:blank",
    });
    const screen = await render(
      <>
        <FieldError data-testid="cusip" errors={byField.get("cusip")} />
        <FieldError data-testid="quantity" errors={byField.get("quantity")} />
        <FieldError data-testid="price" errors={byField.get("price")} />
      </>,
    );
    await expect.element(screen.getByTestId("cusip")).toHaveTextContent("No such bond.");
    await expect
      .element(screen.getByTestId("quantity"))
      .toHaveTextContent("Above the desk's limit.");
    expect(screen.container.querySelector('[data-testid="price"]')).toBeNull();
  });
});
