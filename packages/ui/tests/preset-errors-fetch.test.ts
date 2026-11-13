/* `basis/no-fetch`, the ban on `apiFetch` and `basis/no-hand-rounding` judged both ways (docs/design.md, The
 * toolchain, at its strictest): code that reads the browser's global object for other things, names its own values
 * `send`, and divides a floored page index, passes; each way the review of 2026-11-13 found to reach the network past
 * the generated client, or to round to decimals by hand, now fails, with the line that names the fix. The probe runs `vp lint` in packages/consumer, configured as ctzd configures an app. */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import { afterAll, describe, expect, test } from "vite-plus/test";

import { consumer, findingsIn, lintDiagnostics } from "./lint-probe.ts";

const probeFolder = new URL(".lint-probe-fetch/", consumer);

const ordinary = `const view = globalThis;
const { location } = globalThis;
const width = view.innerWidth;
const send = (text: string): string => text.trim();

function onResize(listener: () => void): () => void {
  globalThis.addEventListener("resize", listener);
  return () => {
    globalThis.removeEventListener("resize", listener);
  };
}

const pageOf = (index: number, size: number, pages: number): number => Math.floor(index / size) / pages;

export { location, onResize, pageOf, send, width };
`;

const evasions = `import { apiFetch } from "@basis/ui";
import * as ui from "@basis/ui";

const { fetch: send } = globalThis;
const w = window;
const aliased = w.fetch("/api/positions");
const asserted = (window as Window).fetch("/api/positions");
const nested = globalThis.window.fetch("/api/positions");
const keyed = window["fetch"]("/api/positions");
const byHand = apiFetch("/positions");
const price = 99.515_625;
const cents = 100;
const roundedDown = Math.floor(price) / 100;
const byFactor = Math.trunc(price * cents) / cents;

export { aliased, asserted, byFactor, byHand, keyed, nested, roundedDown, send, ui };
`;

rmSync(probeFolder, { force: true, recursive: true });
mkdirSync(probeFolder, { recursive: true });
writeFileSync(new URL("ordinary.ts", probeFolder), ordinary);
writeFileSync(new URL("evasions.ts", probeFolder), evasions);
const ordinaryFound = lintDiagnostics(".lint-probe-fetch/ordinary.ts");
const found = lintDiagnostics(".lint-probe-fetch/evasions.ts");

afterAll(() => {
  rmSync(probeFolder, { force: true, recursive: true });
});

const at = findingsIn(found, evasions);
const client =
  "ERROR feature code calls the API only through the generated client: import the operation's hook from src/api/client.ts.";
const byHand =
  "ERROR feature code calls the API only through the generated client, whose hooks parse each answer by its schema, never through apiFetch: import the operation's hook from src/api/client.ts, and for an operation the client lacks, pull the API's new openapi.json with vp run client-pull.";

describe("basis/no-fetch on ordinary code", () => {
  test("passes the global object read for its size and events, and an alias of it", () => {
    expect(ordinaryFound.map(({ code, message }) => `${code} ${message}`)).toStrictEqual([]);
  });
});

describe("basis/no-fetch on fetch reached another way", () => {
  test.each([
    ["destructured from globalThis", "const { fetch: send }"],
    ["through an alias of window", "w.fetch("],
    ["through window asserted as Window", "(window as Window)"],
    ["through globalThis.window", "globalThis.window.fetch"],
    ["by a written key", 'window["fetch"]'],
  ])("refuses fetch %s", (_way, text) => {
    expect(at("basis(no-fetch)", text)).toStrictEqual([client]);
  });
});

describe("the lint on apiFetch outside the client layer", () => {
  test("refuses an import of apiFetch, named or through the whole module", () => {
    expect(at("eslint(no-restricted-imports)", "import { apiFetch }")).toStrictEqual([
      `'apiFetch' import from '@basis/ui' is restricted. ${byHand}`,
    ]);
    expect(at("eslint(no-restricted-imports)", "import * as ui")).toHaveLength(1);
  });
});

describe("basis/no-hand-rounding on a scale undone by hand", () => {
  test.each([
    ["a floored value over a power of ten", "Math.floor(price) / 100", "floor"],
    ["a value scaled and divided by one factor", "Math.trunc(price * cents)", "toward-zero"],
  ])("refuses %s", (_way, text, rounding) => {
    expect(at("basis(no-hand-rounding)", text)).toHaveLength(1);
    expect(at("basis(no-hand-rounding)", text)[0]).toContain(`"${rounding}"`);
  });
});
