import { describe, expect, test } from "vite-plus/test";

import type { Bond } from "#api/client.ts";
import { getBondMockHandler, getBondMockHandler404 } from "#api/mocks.ts";
import { renderApp, worker } from "#test-support.tsx";

const bond: Bond = {
  convention: "30/360",
  coupon_rate: "0.04125",
  frequency: 2,
  issued: "2026-05-15",
  maturity: "2036-05-15",
  security_id: "US91282CRF04",
};

describe("a bond's page", () => {
  test("shows the bond's terms, asking for it by its ISIN", async () => {
    const paths: string[] = [];
    worker.use(
      getBondMockHandler(({ request }) => {
        paths.push(new URL(request.url).pathname);
        return bond;
      }),
    );
    const { screen } = await renderApp("/bonds/US91282CRF04");
    await expect.element(screen.getByRole("heading", { name: "Bond US91282CRF04" })).toBeVisible();
    await expect.element(screen.getByText("Issued 2026-05-15, matures 2036-05-15")).toBeVisible();
    await expect.element(screen.getByText("4.125%")).toBeVisible();
    await expect.element(screen.getByText("30/360")).toBeVisible();
    expect(paths).toStrictEqual(["/api/bonds/US91282CRF04"]);
  });

  test("shows the API's 404 for a bond it does not hold", async () => {
    worker.use(
      getBondMockHandler404({
        detail: "the warehouse has no bond US0000000000",
        instance: "urn:uuid:019a5c3e-0000-7000-8000-000000000404",
        status: 404,
        title: "No bond has that ISIN",
        type: "unknown-bond",
      }),
    );
    const { screen } = await renderApp("/bonds/US0000000000");
    const alert = screen.getByRole("alert", { name: "No bond has that ISIN" });
    await expect.element(alert).toBeVisible();
    await expect.element(alert.getByText("the warehouse has no bond US0000000000")).toBeVisible();
  });

  test("links to the form that records a settlement", async () => {
    worker.use(getBondMockHandler(bond));
    const { screen } = await renderApp("/bonds/US91282CRF04");
    await screen.getByRole("main").getByRole("link", { name: "Record a settlement" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "Record a settlement" }))
      .toBeVisible();
  });
});
