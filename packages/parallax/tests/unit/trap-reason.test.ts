import { expect, test } from "vite-plus/test";

import { trapReason } from "#engine/limits.ts";

test("a trap without a panic is read as the engine running out of memory", () => {
  expect(trapReason("RuntimeError: unreachable")).toBe(
    "The engine in this page stopped after a fatal error (RuntimeError: unreachable), most likely because it ran out of memory. It has started again without its tables: load the data again.",
  );
});

test("a panic is reported as an internal error, with what it said and where", () => {
  const panic = "panicked at crates/parallax-engine/src/view.rs:12:5: a fault";
  const reason = trapReason(panic);
  expect(reason).toBe(
    `The engine in this page stopped after an internal error (${panic}). It has started again without its tables: load the data again, and report the error with the steps that led to it.`,
  );
  expect(reason).not.toContain("memory");
});
