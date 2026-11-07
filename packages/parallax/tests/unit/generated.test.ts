import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/* Until roadmap step 2.6 moves the generator here, the protocol's TypeScript is a byte-for-byte copy of the Angular
 * layer's, which CI regenerates from crates/parallax-protocol/proto/parallax.proto. */
describe("the generated protocol code", () => {
  test("is the code generated from parallax.proto", () => {
    expect(read("../../src/proto/parallax_pb.ts")).toBe(
      read("../../web/projects/parallax/src/lib/proto/parallax_pb.ts"),
    );
  });
});
