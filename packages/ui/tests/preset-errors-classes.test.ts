/* `basis/theme-classes` judged both ways (docs/design.md, The toolchain, at its strictest): an ordinary page, whose
 * classes are chosen with `cn` by comparisons, by a status map and by a helper, passes the app's whole lint with no
 * finding; and each way the review of 2026-11-13 found to slip a class past it now fails, reported where the class is
 * written. The probe runs `vp lint` in packages/consumer, configured as ctzd configures an app. */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import { afterAll, describe, expect, test } from "vite-plus/test";

import { consumer, findingsIn, lintDiagnostics, rawColourText } from "./lint-probe.ts";

const probeFolder = new URL(".lint-probe-classes/", consumer);

const ordinary = `import { cn } from "@basis/ui";
import type { ReactElement } from "react";

interface Row {
  readonly id: string;
  readonly pnl: number;
}

const tones = { gain: "text-gain", loss: "text-loss" } as const;
const cell = "tabular-nums";

function toneOf(pnl: number): string {
  return pnl < 0 ? "text-loss" : "text-gain";
}

function padded(tone: string): string {
  return cn("p-2", tone);
}

function Panel({ className, children }: { readonly className?: string; readonly children: string }): ReactElement {
  return <div className={cn("p-2", className)}>{children}</div>;
}

function Rows({ rows, selected, size }: { readonly rows: readonly Row[]; readonly selected: string; readonly size: number }): ReactElement {
  const wide = rows.length > size;
  return (
    <table className={cn(rows.length > 0 && "border-b", { "w-full": wide })}>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id} className={cn(selected === row.id && "bg-muted", !wide && "h-8")}>
            <td className={cn("tabular-nums", row.pnl < 0 && "text-loss")}>{row.pnl}</td>
            <td className={tones[row.pnl < 0 ? "loss" : "gain"]}>{row.id}</td>
            <td className={toneOf(row.pnl)}>{Math.floor(index / size)}</td>
            <td className={padded("text-gain")}>{row.id}</td>
            <td className={cell}>
              <Panel className="mt-2">{row.id}</Panel>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export { Rows };
`;

const evasions = `import { useMemo } from "react";
import type { ReactElement } from "react";

import { stripe } from "./stripe.ts";

const tone = { bad: "bg-black dark:bg-muted", good: "text-gain" };
const status = { fill: "bg-[#16a34a] text-red-500 p-[13px]" };
const cellClasses = "!p-4 grayscale";
const nested = { row: { cell: "[&>*]:p-4" } };

function toneOf(bad: boolean): string {
  if (bad) {
    return "brightness-50";
  }
  return "text-gain";
}

function Panel({ className }: { readonly className: string }): ReactElement {
  return <div className={className} />;
}

function shade(tone: string): string {
  return tone;
}

function Page({ kind }: { readonly kind: "bad" | "good" }): ReactElement {
  const fromHook = useMemo(() => "p-2", []);
  return (
    <section>
      <div className={tone[kind]} />
      <div className={status[kind === "bad" ? "fill" : "fill"]} />
      <div className={toneOf(kind === "bad")} />
      <div className={shade("dark:bg-accent")} />
      <div className={cellClasses} />
      <div className={nested.row.cell} />
      <div {...{ className: "invert" }} />
      <div className={"text-white" as string} />
      <Panel className="dark:bg-background" />
      <div className={stripe} />
      <div className={fromHook} />
    </section>
  );
}

export { Page };
`;

rmSync(probeFolder, { force: true, recursive: true });
mkdirSync(probeFolder, { recursive: true });
writeFileSync(new URL("ordinary.tsx", probeFolder), ordinary);
writeFileSync(new URL("evasions.tsx", probeFolder), evasions);
writeFileSync(new URL("stripe.ts", probeFolder), 'export const stripe = "p-2";\n');
const ordinaryFound = lintDiagnostics(".lint-probe-classes/ordinary.tsx");
const found = lintDiagnostics(".lint-probe-classes/evasions.tsx");

afterAll(() => {
  rmSync(probeFolder, { force: true, recursive: true });
});

const at = findingsIn(found, evasions);
const rule = "basis(theme-classes)";
const darkMode = (token: string): string =>
  `ERROR "${token}" sets a look for dark mode, and every token of @basis/ui's theme already follows the user's mode: drop the dark: variant and write the token alone, as bg-muted, which is right in both.`;
const filter = (token: string): string =>
  `ERROR "${token}" is a filter, which a Citrix desktop draws on the CPU, standing in for a colour the theme has a token for: use text-muted-foreground or bg-muted for something dimmed, and opacity-disabled for something off.`;
const cannotRead =
  'ERROR these classes come from another module or a function\'s result, where neither the lint nor Tailwind can read them: write them in this file, whole, inline or in a constant or an object of classes, and choose between them with a condition, as cn("p-2", wide && "p-4") with cn from @basis/ui.';

describe("basis/theme-classes on ordinary code", () => {
  test("passes cn with comparisons, a status map, a helper, a constant and an app's own component", () => {
    expect(ordinaryFound.map(({ code, message }) => `${code} ${message}`)).toStrictEqual([]);
  });
});

describe("basis/theme-classes on a class written away from its element", () => {
  test("reads an object of classes at the key a page chooses, where the class is written", () => {
    expect(at(rule, "const tone =")).toStrictEqual([
      `ERROR "bg-black" ${rawColourText}`,
      darkMode("dark:bg-muted"),
    ]);
    expect(at(rule, "<div className={tone[kind]}")).toStrictEqual([]);
  });

  test("refuses a colour or a value off the theme that @shadcn/lint cannot see behind a key chosen at run time", () => {
    expect(at(rule, "const status =")).toStrictEqual([
      `ERROR "bg-[#16a34a]" ${rawColourText}`,
      `ERROR "text-red-500" ${rawColourText}`,
      `ERROR "p-[13px]" is a value off @basis/ui's theme, and an app declares no tokens or scales of its own: use the theme's nearest step or token instead, and for a colour the token named by its meaning, as text-loss for red or bg-muted for grey.`,
    ]);
  });

  test("reads what a helper of the file returns, a constant, a nested object and a spread", () => {
    expect(at(rule, '"brightness-50"')).toStrictEqual([filter("brightness-50")]);
    expect(at(rule, "const cellClasses")).toStrictEqual([
      "ERROR \"!p-4\" forces its style with !important over the theme's: drop the !, and where a component's own style wins, set its variant or size instead, as vp run docs NAME shows them.",
      filter("grayscale"),
    ]);
    expect(at(rule, "const nested")).toStrictEqual([
      'ERROR "[&>*]:p-4" styles other elements through a selector, where no check can see them: put the class on each element it is for, or render them with a component whose variant gives the look.',
    ]);
    expect(at(rule, '"invert"')).toStrictEqual([filter("invert")]);
    expect(at(rule, '"text-white" as string')).toStrictEqual([
      `ERROR "text-white" ${rawColourText}`,
    ]);
  });

  test("reads the classes a call passes a helper of the file that returns them", () => {
    expect(at(rule, 'shade("dark:bg-accent")')).toStrictEqual([darkMode("dark:bg-accent")]);
  });

  test("reads the classes an app's own component is given, as a plain element's", () => {
    expect(at(rule, "<Panel className=")).toStrictEqual([darkMode("dark:bg-background")]);
  });

  test("refuses classes from another module or a function's result, naming where to write them", () => {
    expect(at(rule, "className={stripe}")).toStrictEqual([cannotRead]);
    expect(at(rule, "const fromHook")).toStrictEqual([cannotRead]);
  });
});
