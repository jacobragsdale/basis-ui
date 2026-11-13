/* What `vp run verify` makes of a tool that misbehaves: one that exits non-zero with a report that says nothing is
 * wrong, or a child that dies before it can say anything. Neither is ever a passing stage. The tools are fakes, a
 * `vite-plus` in a temporary app whose `vp` prints what the test gives it. */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { lintFindings, withReportFile } from "#preset/verify-tools.ts";
import { verify } from "#preset/verify.ts";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

/** An app whose `vp` answers `vp fmt` with nothing and `vp lint` with `report` on stdout and exit `status`. */
function appWithLint(report: string, status: number): string {
  const root = mkdtempSync(path.join(tmpdir(), "basis-ui-verify-tools-"));
  roots.push(root);
  const vitePlus = path.join(root, "node_modules/vite-plus");
  mkdirSync(path.join(vitePlus, "bin"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
  writeFileSync(
    path.join(vitePlus, "package.json"),
    JSON.stringify({ name: "vite-plus", version: "0.0.0" }),
  );
  writeFileSync(
    path.join(vitePlus, "bin/vp"),
    `if (process.argv[2] === "lint") {\n  process.stdout.write(${JSON.stringify(report)});\n  process.stderr.write("the type-aware pass crashed\\n");\n  process.exitCode = ${String(status)};\n}\n`,
  );
  return root;
}

describe(lintFindings, () => {
  test("a lint that exits non-zero with a report of no errors fails, saying it could not be read", () => {
    const root = appWithLint(JSON.stringify({ diagnostics: [] }), 1);
    expect(lintFindings(root).map(({ text }) => text)).toStrictEqual([
      'ERROR vp lint failed (exit 1) with no report to read, saying "the type-aware pass crashed": run vp lint to see its whole output, and fix what it says.',
    ]);
  });

  test("a lint that exits 0 with a report of warnings only passes", () => {
    const warning = { filename: "src/a.ts", message: "a warning", severity: "warning" };
    const root = appWithLint(JSON.stringify({ diagnostics: [warning] }), 0);
    expect(lintFindings(root)).toStrictEqual([]);
  });
});

describe("the client stage", () => {
  test("fails when the client check's child dies before it says anything", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "basis-ui-verify-client-"));
    roots.push(root);
    // The child cannot start, as with a bad NODE_OPTIONS on a desktop.
    vi.stubEnv("NODE_OPTIONS", `--require=${path.join(root, "missing.cjs")}`);
    const { failed, text } = await verify(root, ["--stage", "client"]);
    expect(failed).toBe(true);
    expect(text).toMatch(/^ERROR vp run client-check failed \(exit 1\) with no report to read/mu);
  });
});

describe(withReportFile, () => {
  test.skipIf(process.platform === "win32")(
    "returns what the tool reported though its folder cannot be removed, as when a scanner holds a file",
    () => {
      let locked = "";
      const result = withReportFile("report.json", (file) => {
        // A folder of the report's that refuses to be emptied, as a file a virus scanner holds open does on Windows.
        locked = path.join(path.dirname(file), "held");
        mkdirSync(locked);
        writeFileSync(path.join(locked, "open.txt"), "");
        chmodSync(locked, 0o500);
        return "the report";
      });
      chmodSync(locked, 0o700);
      rmSync(path.dirname(locked), { force: true, recursive: true });
      expect(result).toBe("the report");
    },
  );
});
