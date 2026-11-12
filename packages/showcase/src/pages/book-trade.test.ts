/* Booking a trade: the bond found by its CUSIP, the ticket filled, the CUSIP typed to confirm, and the desk's 422
 * placed on the fields it names. Written with @basis/ui/testing, so it runs in Chromium and in a Node DOM. */

import { mockApi, renderApp, screen, userEvent, waitFor } from "@basis/ui/testing";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { getBookTradeMockHandler422, getSecuritiesMockHandler } from "#api/mocks.ts";
import { routeTree } from "#routes.ts";

const bond = {
  cusip: "ATL000A02",
  description: "Atlas Corp 5.250% 2031-08-18",
  isin: "USATL000A027",
};

const deskAnswer = await mockApi();

beforeEach(() => {
  deskAnswer.use(
    getSecuritiesMockHandler([bond]),
    getBookTradeMockHandler422({
      detail: "Two fields break the desk's checks.",
      errors: [
        { detail: "250,000,000 face is over the book's limit.", pointer: "#/face" },
        { detail: "2026-11-11 is Veterans Day: settle on 2026-11-12.", pointer: "#/settle_date" },
      ],
      status: 422,
      title: "The trade breaks the desk's checks",
      type: "invalid-request",
    }),
  );
});

afterEach(() => {
  deskAnswer.reset();
});

/** Finds the bond by its CUSIP and fills the rest of the ticket. */
async function fillTicket(): Promise<void> {
  const user = userEvent.setup();
  await user.type(await screen.findByRole("combobox", { name: "Bond" }), bond.cusip);
  await user.click(await screen.findByRole("option", { name: bond.description }));
  await user.type(screen.getByLabelText("Face"), "250mm");
  await user.type(screen.getByLabelText("Price"), "99.1875");
  await user.type(screen.getByLabelText("Settlement date"), "2026-11-11");
  await user.type(screen.getByLabelText("Counterparty"), "Northwind Securities");
}

/** Books the ticket, typing the bond's CUSIP to confirm. */
async function confirmByCusip(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Book trade" }));
  await user.type(await screen.findByLabelText(`Type ${bond.cusip} to confirm`), bond.cusip);
  await user.click(screen.getByRole("button", { name: "Book trade" }));
}

describe("booking a trade", () => {
  test("asks for the CUSIP to be typed, then shows the desk's 422 on the fields it names", async () => {
    renderApp(routeTree, "/book");
    await fillTicket();
    await confirmByCusip();
    await waitFor(() => {
      expect(screen.getByText("250,000,000 face is over the book's limit.")).toBeDefined();
    });
    expect(screen.getByText("2026-11-11 is Veterans Day: settle on 2026-11-12.")).toBeDefined();
    expect(screen.getByLabelText("Face").getAttribute("aria-invalid")).toBe("true");
  });
});
