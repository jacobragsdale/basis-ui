/* Fixture mode, as `vp dev` runs the example with no API: every page from the committed fixtures, and the order the
 * sources answer in: a record in .fixtures/, then a committed fixture, then orval's generated handlers. */

import { describe, expect, test } from "vite-plus/test";

import { conventions, dirtyPrice } from "#api/client.ts";
import { fixtureMode, json, record } from "#fixture-mode-support.ts";
import { renderApp } from "#test-support.tsx";

/** A price of the bond in the record of its dirty price, with `accrued` as the interest it says. */
function priced(accrued: string): Readonly<Record<string, unknown>> {
  return json({
    accrued,
    clean: "990000.00",
    dirty: "1010052.08",
    face: "1000000.00",
    security_id: "US91282CRF04",
    settle: "2026-11-10",
  });
}

describe("the app on its committed fixtures, with no API", () => {
  test("lists the conventions fixtures/conventions.json holds", async () => {
    const answers = fixtureMode();
    const { screen } = await renderApp("/");
    await expect.element(screen.getByRole("cell", { name: "ACT/365F" })).toBeVisible();
    expect(screen.getByRole("row").elements()).toHaveLength(4);
    expect(answers).toStrictEqual([
      {
        file: "fixtures/conventions.json",
        request: "GET /conventions",
        source: "fixture",
        status: 200,
      },
    ]);
  });

  test("shows the bond fixtures/bond-US91282CRF04.json holds", async () => {
    fixtureMode();
    const { screen } = await renderApp("/bonds/US91282CRF04");
    await expect.element(screen.getByText("Issued 2026-05-15, matures 2036-05-15")).toBeVisible();
    await expect.element(screen.getByText("4.125%")).toBeVisible();
  });

  test("shows the problem fixtures/bond-US0000000000.json answers for an unknown bond", async () => {
    fixtureMode();
    const { screen } = await renderApp("/bonds/US0000000000");
    const alert = screen.getByRole("alert", { name: "No bond has that ISIN" });
    await expect.element(alert.getByText("No bond has the ISIN US0000000000.")).toBeVisible();
  });

  test("records a settlement with the answer fixtures/settlement.json holds, and opens its bond", async () => {
    const answers = fixtureMode();
    const { screen } = await renderApp("/settlements/new");
    await screen.getByLabelText("ISIN").fill("US91282CRF04");
    await screen.getByLabelText("Face amount").fill("1000000.00");
    await screen.getByLabelText("Settlement date").fill("2026-11-10");
    await screen.getByRole("button", { name: "Record settlement" }).click();
    const notifications = screen.getByRole("region", { name: "Notifications" });
    await expect
      .element(notifications.getByText("Recorded the settlement of US91282CRF04"))
      .toBeVisible();
    await expect.element(screen.getByRole("heading", { name: "Bond US91282CRF04" })).toBeVisible();
    expect(answers.map(({ file }) => file)).toStrictEqual([
      "fixtures/settlement.json",
      "fixtures/bond-US91282CRF04.json",
    ]);
  });
});

describe("the order fixture mode answers in", () => {
  test("a record in .fixtures/ answers before the committed fixture of the same request", async () => {
    const recorded = [{ convention: "ACT/360", year_days: 360 }];
    const answers = fixtureMode({
      ".fixtures/conventions.json": record("conventions", { path: "/conventions" }, json(recorded)),
    });
    const { screen } = await renderApp("/");
    await expect.element(screen.getByRole("cell", { name: "ACT/360" })).toBeVisible();
    expect(screen.getByRole("row").elements()).toHaveLength(2);
    expect(answers).toMatchObject([{ file: ".fixtures/conventions.json", source: "record" }]);
  });

  test("a committed fixture answers before orval's generated handlers", async () => {
    const answers = fixtureMode();
    const { data } = await conventions();
    expect(data.map(({ convention }) => convention)).toStrictEqual([
      "30/360",
      "ACT/360",
      "ACT/365F",
    ]);
    expect(answers).toMatchObject([{ source: "fixture" }]);
  });

  test("orval's generated handlers answer what no fixture holds", async () => {
    const answers = fixtureMode();
    const { data } = await dirtyPrice("US91282CRF04", { face: "1000000.00", settle: "2026-11-10" });
    expect(Object.keys(data).toSorted()).toStrictEqual([
      "accrued",
      "clean",
      "dirty",
      "face",
      "security_id",
      "settle",
    ]);
    expect(answers).toStrictEqual([
      {
        request: "GET /bonds/US91282CRF04/dirty-price?face=1000000.00&settle=2026-11-10",
        source: "generated",
        status: 200,
      },
    ]);
  });

  test("the first record in file order whose method, path and query match answers; another query is another request", async () => {
    const asked = {
      path: "/bonds/US91282CRF04/dirty-price",
      query: { face: ["1000000.00"], settle: ["2026-11-10"] },
    };
    const answers = fixtureMode({
      ".fixtures/b.json": record("dirty_price", asked, priced("2.00")),
      ".fixtures/a.json": record("dirty_price", asked, priced("1.00")),
    });
    const first = await dirtyPrice("US91282CRF04", { face: "1000000.00", settle: "2026-11-10" });
    expect(first.data.accrued).toBe("1.00");
    await dirtyPrice("US91282CRF04", { face: "1000000.00", settle: "2026-11-11" });
    expect(answers.map(({ source, file }) => `${String(source)} ${String(file)}`)).toStrictEqual([
      "record .fixtures/a.json",
      "generated undefined",
    ]);
  });
});
