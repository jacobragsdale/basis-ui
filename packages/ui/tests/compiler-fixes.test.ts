/* The React Compiler's errors, as basisPlugins() wraps them, open with an ERROR line that names the fix, and keep the
 * compiler's own text below it. These run the real compiler, through the Babel plugin the preset uses. */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { build } from "vite-plus";
import { afterAll, describe, expect, test, vi } from "vite-plus/test";

import { compilerFix, withCompilerFixes } from "#preset/compiler-fixes.ts";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const scratch = mkdtempSync(path.join(tmpdir(), "basis-compiler-"));

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true });
});

/** What building `code` as an app's module, with the compiler as basisPlugins() wraps it, throws, or the empty string
 * when it builds. React stays external, so the build needs nothing installed beside the module. */
async function compileError(code: string): Promise<string> {
  const entry = path.join(scratch, `page-${String(Math.random()).slice(2)}.jsx`);
  writeFileSync(entry, code);
  const compiler = withCompilerFixes(
    await babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] }),
  );
  try {
    await build({
      build: {
        lib: { entry, formats: ["es"] },
        outDir: path.join(scratch, "dist"),
        rolldownOptions: { external: [/^react/u] },
        write: false,
      },
      configFile: false,
      logLevel: "silent",
      plugins: [compiler],
      root: scratch,
    });
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("a component the React Compiler cannot compile", () => {
  test.each([
    [
      "a hook called conditionally",
      'import { useState } from "react";\nexport function A({ on }) { if (on) { useState(0); } return <div />; }',
      "call every hook at the top level of the component",
    ],
    [
      "a ref read during render",
      'import { useRef } from "react";\nexport function B() { const r = useRef(0); r.current += 1; return <div>{r.current}</div>; }',
      "read and write ref.current only in event handlers and effects",
    ],
    [
      "state set during render",
      'import { useState } from "react";\nexport function C() { const [n, setN] = useState(0); setN(n + 1); return <div>{n}</div>; }',
      "set state in an event handler or an effect",
    ],
  ])("%s fails with its fix first, then the compiler's own text", async (_name, code, fix) => {
    const message = await compileError(code);
    const first = message.split("\n").find((line) => line.includes("ERROR the React Compiler"));
    expect(first, message).toContain(
      `ERROR the React Compiler cannot compile this component: ${fix}`,
    );
    expect(message).toMatch(/Found \d+ errors?:/u);
  });

  test("a component that follows the rules compiles", async () => {
    expect(await compileError("export function D({ n }) { return <div>{n * 2}</div>; }")).toBe("");
  });
});

describe(compilerFix, () => {
  test("a message it has no fix for points to the Rules of React", () => {
    expect(compilerFix("Some new rule")).toBe(
      "ERROR the React Compiler cannot compile this component: rewrite it to follow the rule the error below names (https://react.dev/reference/rules).",
    );
  });
});
