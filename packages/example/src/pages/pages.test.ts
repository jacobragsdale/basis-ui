/* The example's pages as an app's tests are written: with @basis/ui/testing only, so they run in Chromium (`vp test`)
 * and in a Node DOM on a machine with no browser (`BASIS_TEST_DOM=node vp test`). */

import { fakeSignIn } from "@basis/ui";
import { mockApi, renderApp, screen, userEvent, within } from "@basis/ui/testing";
import type { MockApi } from "@basis/ui/testing";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, describe, expect, test } from "vite-plus/test";

import type { Bond, DayCount, Settlement } from "#api/client.ts";
import {
  getBondMockHandler,
  getConventionsMockHandler,
  getRecordSettlementMockHandler,
} from "#api/mocks.ts";
import { routeTree } from "#routes.ts";

import couponsRecord from "#fixtures/bond-US91282CRF04-coupons.json";

const conventions: DayCount[] = [
  { convention: "30/360", year_days: 360 },
  { convention: "ACT/365F", year_days: 365 },
];

const bond: Bond = {
  convention: "30/360",
  coupon_rate: 0.04125,
  frequency: 2,
  issued: "2026-05-15",
  maturity: "2036-05-15",
  security_id: "US91282CRF04",
};

const settlement: Settlement = {
  accrued: 20_510.87,
  face: 1_000_000,
  recorded_at: "2026-11-07T15:30:00Z",
  security_id: "US91282CRF04",
  settle: "2026-11-10",
  settlement_id: "019a5c3e-0000-7000-8000-0000000000aa",
};

/** The coupons as the committed fixture holds them: real Arrow, with the interest's display format in its metadata. */
const couponBytes = Uint8Array.from(
  atob(couponsRecord.response.body_base64),
  (c) => c.codePointAt(0) ?? 0,
);

const api: MockApi = await mockApi(
  getConventionsMockHandler(conventions),
  getBondMockHandler(bond),
  http.get(
    "*/bonds/:security/coupons",
    () =>
      new HttpResponse(couponBytes, {
        headers: { "content-type": "application/vnd.apache.arrow.stream" },
      }),
  ),
);

afterEach(() => {
  api.reset();
});

afterAll(async () => {
  await api.close();
});

describe("the example's pages, with or without a browser", () => {
  test("the conventions page lists each convention", async () => {
    renderApp(routeTree, "/", { signIn: fakeSignIn() });
    expect(await screen.findByRole("cell", { name: "ACT/365F" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "365" })).toBeTruthy();
  });

  test("a bond's page shows its terms, and its coupons by the format their Arrow declares", async () => {
    renderApp(routeTree, "/bonds/US91282CRF04", { signIn: fakeSignIn() });
    expect(await screen.findByText("Issued 2026-05-15, matures 2036-05-15")).toBeTruthy();
    expect(screen.getByText("4.125%")).toBeTruthy();
    const coupons = await screen.findByRole("table", { name: "Coupons" });
    const interest = await within(coupons).findAllByText("2.0600");
    expect(interest.length).toBeGreaterThan(0);
  });

  test("the settlement form reads 1mm and sends the number", async () => {
    const sent: unknown[] = [];
    api.use(
      getRecordSettlementMockHandler(async ({ request }) => {
        sent.push(await request.json());
        return settlement;
      }),
    );
    renderApp(routeTree, "/settlements/new", { signIn: fakeSignIn() });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("ISIN"), "US91282CRF04");
    await user.type(screen.getByLabelText("Face amount"), "1mm");
    await user.type(screen.getByLabelText("Settlement date"), "2026-11-10");
    await user.click(screen.getByRole("button", { name: "Record settlement" }));
    expect(await screen.findByText("Issued 2026-05-15, matures 2036-05-15")).toBeTruthy();
    expect(sent).toStrictEqual([
      { face: 1_000_000, security_id: "US91282CRF04", settle: "2026-11-10" },
    ]);
  });
});
