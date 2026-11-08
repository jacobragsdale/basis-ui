/* The preset refuses display rounding in an app's code, and each error names the fix, since in an app agents write
 * nobody reads the code (docs/design.md, Numbers). The probe runs `vp lint` in packages/consumer, the app configured
 * exactly as the README says, on a file of every banned call. */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import { afterAll, describe, expect, test } from "vite-plus/test";

const consumer = new URL("../../consumer/", import.meta.url);
const probeFolder = new URL(".lint-probe/", consumer);

const probe = `const price = 99.515_625;
export const shown = [price.toFixed(2), price.toPrecision(4), price.toLocaleString(), Math.round(price)];
export const format = new Intl.NumberFormat("en-US");
export const whole = [Math.floor(price), Math.trunc(price)];
`;

/** `vp lint`'s report on the probe, run as the app runs it. */
function lintReport(): string {
  rmSync(probeFolder, { force: true, recursive: true });
  mkdirSync(probeFolder, { recursive: true });
  writeFileSync(new URL("probe.ts", probeFolder), probe);
  const vp = new URL("node_modules/.bin/vp", consumer).pathname;
  try {
    return execFileSync(vp, ["lint", ".lint-probe/probe.ts"], {
      cwd: consumer,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
  } catch (error) {
    return error instanceof Error && "stdout" in error ? String(error.stdout) : String(error);
  }
}

const report = lintReport();
const findings = report.split("\n").filter((line) => line.includes("no-restricted-properties"));

afterAll(() => {
  rmSync(probeFolder, { force: true, recursive: true });
});

describe("the preset's lint against display rounding in an app", () => {
  test.each(["toFixed", "toPrecision", "toLocaleString", "Math.round", "Intl.NumberFormat"])(
    "refuses %s, naming the components to use instead",
    (call) => {
      const finding = findings.find((line) => line.includes(`'${call}' is restricted`));
      expect(finding, report).toBeDefined();
      expect(finding).toContain("show it with Num, Money, Pct, Bps or Price32 from @basis/ui");
      expect(finding).toContain("numberText(value, { decimals })");
    },
  );

  test("sends an integer that is not shown to Math.floor or Math.trunc, which it allows", () => {
    const round = findings.find((line) => line.includes("'Math.round' is restricted"));
    expect(round).toContain("use Math.floor or Math.trunc");
    expect(findings).toHaveLength(5);
  });

  test("sends a date to DateTime", () => {
    const local = findings.find((line) => line.includes("'toLocaleString' is restricted"));
    expect(local).toContain("a date or time with DateTime");
  });
});
