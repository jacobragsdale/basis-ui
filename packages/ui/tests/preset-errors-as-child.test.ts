/* Radix's `asChild`, which shadcn's examples write and @basis/ui's components do not take, refused in an app's lint
 * with a line that says to pass the element through `render`. The probe runs `vp lint` in packages/consumer. */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import { afterAll, expect, test } from "vite-plus/test";

import { consumer, lintDiagnostics } from "./lint-probe.ts";

const probeFolder = new URL(".lint-probe-as-child/", consumer);

const probe = `import { Button, Dialog, DialogTrigger } from "@basis/ui";
import type { ReactElement } from "react";

export function Opener(): ReactElement {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open</Button>
      </DialogTrigger>
    </Dialog>
  );
}
`;

rmSync(probeFolder, { force: true, recursive: true });
mkdirSync(probeFolder, { recursive: true });
writeFileSync(new URL("probe.tsx", probeFolder), probe);
const diagnostics = lintDiagnostics(".lint-probe-as-child/probe.tsx");

afterAll(() => {
  rmSync(probeFolder, { force: true, recursive: true });
});

test("refuses asChild, saying to pass the element through render", () => {
  const found = diagnostics.find(({ code }) => code.includes("no-as-child"));
  expect(found?.message).toBe(
    `ERROR asChild is Radix's prop, which @basis/ui's components do not take: they are Base UI's, so pass the element to render as, as <DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>, with the text inside the component.`,
  );
  expect(found?.labels[0]?.span.line).toBe(7);
});
