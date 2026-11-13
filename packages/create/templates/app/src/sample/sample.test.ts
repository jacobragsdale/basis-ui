/* The sample's pages, answered by the generated client's handlers. Delete it with the rest of src/sample/ once the app
 * calls its own API (AGENTS.md). */

import { mockApi, renderApp, screen } from "@basis/ui/testing";
import { afterAll, expect, test } from "vite-plus/test";

import { getBondMockHandler, getConventionsMockHandler } from "#api/mocks.ts";
import { routeTree } from "#routes.ts";

const api = await mockApi(
  getConventionsMockHandler([{ convention: "ACT/365F", year_days: 365 }]),
  getBondMockHandler({
    convention: "30/360",
    coupon_rate: 0.04125,
    frequency: 2,
    issued: "2026-05-15",
    maturity: "2036-05-15",
    security_id: "US91282CRF04",
  }),
);

afterAll(async () => {
  await api.close();
});

test("the conventions page lists what the API answers", async () => {
  renderApp(routeTree, "/conventions");
  expect(await screen.findByRole("cell", { name: "ACT/365F" })).toBeTruthy();
});

test("a bond's page shows its terms", async () => {
  renderApp(routeTree, "/bonds/US91282CRF04");
  const matures = await screen.findByText("Matures");
  expect(matures.nextElementSibling?.textContent).toBe("2036-05-15");
});
