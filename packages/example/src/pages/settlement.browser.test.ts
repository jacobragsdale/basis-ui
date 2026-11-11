import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import type { RenderResult } from "vitest-browser-react";

import type { Bond, Settlement, SettlementRequest } from "#api/client.ts";
import {
  getBondMockHandler,
  getRecordSettlementMockHandler,
  getRecordSettlementMockHandler422,
} from "#api/mocks.ts";
import { renderApp, worker } from "#test-support.tsx";

const request: SettlementRequest = {
  face: 1_000_000,
  security_id: "US91282CRF04",
  settle: "2026-11-10",
};

const settlement: Settlement = {
  accrued: 20_510.87,
  face: 1_000_000,
  recorded_at: "2026-11-07T15:30:00Z",
  security_id: "US91282CRF04",
  settle: "2026-11-10",
  settlement_id: "019a5c3e-0000-7000-8000-0000000000aa",
};

const bond: Bond = {
  convention: "30/360",
  coupon_rate: 0.04125,
  frequency: 2,
  issued: "2026-05-15",
  maturity: "2036-05-15",
  security_id: "US91282CRF04",
};

/** Fills the form with `values` and sends it. */
async function record(screen: RenderResult, values: SettlementRequest): Promise<void> {
  await screen.getByLabelText("ISIN").fill(values.security_id);
  await screen.getByLabelText("Face amount").fill(String(values.face));
  await screen.getByLabelText("Settlement date").fill(values.settle);
  await screen.getByRole("button", { name: "Record settlement" }).click();
}

/** Follows the sidebar's link to the start page. */
async function leaveForTheStart(screen: RenderResult): Promise<void> {
  await userEvent.click(screen.getByRole("link", { name: "Day count conventions" }).first());
}

describe("the settlement form", () => {
  test("records a settlement the API accepts, says so, and opens its bond", async () => {
    const sent: unknown[] = [];
    worker.use(
      getBondMockHandler(bond),
      getRecordSettlementMockHandler(async ({ request: posted }) => {
        sent.push(await posted.clone().json());
        return settlement;
      }),
    );
    const { screen, reports } = await renderApp("/settlements/new");
    await record(screen, request);
    const notifications = screen.getByRole("region", { name: "Notifications" });
    await expect
      .element(notifications.getByText("Recorded the settlement of US91282CRF04"))
      .toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Bond US91282CRF04" })).toBeVisible();
    expect(sent).toStrictEqual([request]);
    expect(reports.events).toStrictEqual(["settlement.recorded"]);
  });

  test("puts each error a 422 names on the field its pointer names, and raises no toast", async () => {
    worker.use(
      getRecordSettlementMockHandler422({
        errors: [{ detail: "Input should be greater than 0", pointer: "#/face" }],
        instance: "urn:uuid:019a5c3e-0000-7000-8000-000000000422",
        status: 422,
        title: "The request is not valid",
        type: "invalid-request",
      }),
    );
    const { screen, reports } = await renderApp("/settlements/new");
    await record(screen, { ...request, face: 0 });
    const face = screen.getByLabelText("Face amount");
    await expect.element(face).toHaveAttribute("aria-invalid", "true");
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Input should be greater than 0");
    await expect.element(screen.getByLabelText("ISIN")).toHaveAttribute("aria-invalid", "false");
    await expect
      .element(screen.getByRole("region", { name: "Notifications" }).getByText(/not valid/u))
      .not.toBeInTheDocument();
    expect(reports.errors.map(({ source }) => source)).toStrictEqual(["mutation"]);
  });

  test("shows a 422 that names no field above the button, with its detail", async () => {
    worker.use(
      getRecordSettlementMockHandler422({
        detail: "US91282CRF04 matures on 2036-05-15, and the settlement date is 2036-06-02",
        errors: [],
        status: 422,
        title: "The bond matures on or before the settlement date",
        type: "matured",
      }),
    );
    const { screen } = await renderApp("/settlements/new");
    await record(screen, { ...request, settle: "2036-06-02" });
    const alert = screen.getByRole("alert", {
      name: "The bond matures on or before the settlement date",
    });
    await expect
      .element(
        alert.getByText(
          "US91282CRF04 matures on 2036-05-15, and the settlement date is 2036-06-02",
        ),
      )
      .toBeVisible();
    await expect
      .element(screen.getByLabelText("Settlement date"))
      .toHaveAttribute("aria-invalid", "false");
  });

  test("checks each field by the document's schema, and sends nothing until they pass", async () => {
    let sent = 0;
    worker.use(
      getRecordSettlementMockHandler(() => {
        sent += 1;
        return settlement;
      }),
    );
    const { screen } = await renderApp("/settlements/new");
    const security = screen.getByLabelText("ISIN");
    await security.fill("us91282crf04");
    await userEvent.tab();
    await expect.element(security).toHaveAttribute("aria-invalid", "true");
    await screen.getByRole("button", { name: "Record settlement" }).click();
    await expect
      .element(screen.getByLabelText("Face amount"))
      .toHaveAttribute("aria-invalid", "true");
    expect(sent).toBe(0);
  });

  test("asks before a page with changes is left, and Stay keeps them", async () => {
    const { screen } = await renderApp("/settlements/new");
    await screen.getByLabelText("ISIN").fill("US91282CRF04");
    await leaveForTheStart(screen);
    const dialog = screen.getByRole("alertdialog", { name: "Leave without saving?" });
    await expect.element(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stay on this page" }).click();
    await expect.element(screen.getByLabelText("ISIN")).toHaveValue("US91282CRF04");
  });

  test("leaves a page with changes once told to", async () => {
    const { screen } = await renderApp("/settlements/new");
    await screen.getByLabelText("ISIN").fill("US91282CRF04");
    await leaveForTheStart(screen);
    await screen.getByRole("button", { name: "Leave without saving" }).click();
    await expect.element(screen.getByLabelText("ISIN")).not.toBeInTheDocument();
  });
});
