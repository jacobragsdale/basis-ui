/* The doors probes found open on 2026-11-09 (docs/design.md, The toolchain, at its strictest): each line of the probe
 * passed an app's lint then, and fails it now with one line that starts with ERROR and ends with its fix, held here by
 * its exact text, as preset-errors.test.ts holds the rest of the preset's errors. The probe runs `vp lint` in
 * packages/consumer, configured as ctzd configures an app. The drift check's doors, an app's own configuration and
 * dependencies, and verify's step that reads suppressions as text are held in drift-check.test.ts. */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import { afterAll, describe, expect, test } from "vite-plus/test";

import { consumer, findingsIn, lintDiagnostics, rawColourText } from "./lint-probe.ts";

const probeFolder = new URL(".lint-probe-doors/", consumer);

const doors = `import { LineChart } from "recharts";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "react-aria-components";

const size = 4;
const when = new Date();
const amount = 1.234;
// oxlint-disable-next-line eslint/no-console -- a reason
console.info(amount);
// @ts-expect-error -- a string is no number
const wrong: number = "1";
// @ts-ignore
const ignored: number = "2";
// oxlint-disable-next-line oxc/no-barrel-file -- outside src/api
const shown = [
  <div key="a" className="bg-black text-white">a</div>,
  <div key="b" className="dark:bg-muted">b</div>,
  <div key="c" className="grayscale">c</div>,
  <div key="d" className="brightness-50">d</div>,
  <div key="e" className="!p-4">e</div>,
  <div key="f" className="[&>*]:p-4">f</div>,
  <div key="g" className={\`p-\${String(size)}\`}>g</div>,
  <div key="h" className="flexx">h</div>,
  <div key="i" className="p-[12px]">i</div>,
  <div key="j" style={{ color: "red" }}>j</div>,
];
const dates = [when.toLocaleDateString(), new Intl.DateTimeFormat("en-US").format(when)];
const roundedUp = Math.ceil(amount * 100) / 100;
const network = [new XMLHttpRequest(), new WebSocket("wss://positions.example/live")];
const beacon = navigator.sendBeacon("/api/seen");

const libraries = [LineChart, useForm, toast, Button];

export { beacon, dates, ignored, libraries, network, roundedUp, shown, wrong };
/* eslint-disable */
`;

/* src/api, the client layer: its barrel files may turn off oxc/no-barrel-file, the allowlist's one rule, and it calls
 * no fetch either. */
const clientLayer = `// oxlint-disable-next-line oxc/no-barrel-file -- the generated client's whole surface.
export * from "../doors.tsx";
export const positions = fetch("/api/positions");
`;

rmSync(probeFolder, { force: true, recursive: true });
mkdirSync(new URL("src/api/", probeFolder), { recursive: true });
writeFileSync(new URL("doors.tsx", probeFolder), doors);
writeFileSync(new URL("src/api/client.ts", probeFolder), clientLayer);
const found = lintDiagnostics(".lint-probe-doors/doors.tsx");
const foundInClient = lintDiagnostics(".lint-probe-doors/src/api/client.ts");

afterAll(() => {
  rmSync(probeFolder, { force: true, recursive: true });
});

// What a rule reports on the doors probe's line, or the client layer's, holding a text.
const at = findingsIn(found, doors);
const inClient = findingsIn(foundInClient, clientLayer);

describe("the preset's lint against a comment that turns a check off", () => {
  const ignoreRule =
    "and an app turns off no rule but oxc/no-barrel-file in src/api: remove the comment and fix what the rule reports, as its ERROR line says.";
  const typeError =
    "hides a type error, and an app hides none: remove it and fix the type the compiler names, parsing a value of unknown shape with a zod schema rather than asserting its type.";

  test("refuses a comment that turns a rule off, but the allowlist's one in src/api", () => {
    expect(at("basis(no-suppressions)", "eslint/no-console")).toStrictEqual([
      `ERROR oxlint-disable-next-line turns off eslint/no-console, ${ignoreRule}`,
    ]);
    /* One that names no rule turns this rule off too, from where it stands; Oxlint's own rule still refuses it,
     * and verify's suppressions step, which reads the file as text, names the fix. */
    expect(at("unicorn(no-abusive-eslint-disable)", "/* eslint-disable */")).toHaveLength(1);
    expect(at("basis(no-suppressions)", "outside src/api")).toStrictEqual([
      `ERROR oxlint-disable-next-line turns off oxc/no-barrel-file, ${ignoreRule}`,
    ]);
    expect(inClient("basis(no-suppressions)", "oxc/no-barrel-file")).toStrictEqual([]);
  });

  test("refuses @ts-expect-error and @ts-ignore, which TypeScript would honour silently", () => {
    expect(at("basis(no-suppressions)", "@ts-expect-error")).toStrictEqual([
      `ERROR @ts-expect-error ${typeError}`,
    ]);
    expect(at("basis(no-suppressions)", "@ts-ignore")).toStrictEqual([
      `ERROR @ts-ignore ${typeError}`,
    ]);
    expect(found.filter(({ code }) => code.includes("ban-ts-comment"))).toStrictEqual([]);
  });
});

describe("the preset's lint against a plain element's classes the theme lacks", () => {
  test("refuses a plain element's black and white, dark: variant, filter, !important and selector", () => {
    expect(at("basis(theme-classes)", "bg-black")).toStrictEqual([
      `ERROR "bg-black" ${rawColourText}`,
      `ERROR "text-white" ${rawColourText}`,
    ]);
    expect(at("basis(theme-classes)", "dark:bg-muted")).toStrictEqual([
      `ERROR "dark:bg-muted" sets a look for dark mode, and every token of @basis/ui's theme already follows the user's mode: drop the dark: variant and write the token alone, as bg-muted, which is right in both.`,
    ]);
    const filter =
      "is a filter, which a Citrix desktop draws on the CPU, standing in for a colour the theme has a token for: use text-muted-foreground or bg-muted for something dimmed, and opacity-disabled for something off.";
    expect(at("basis(theme-classes)", '"grayscale"')).toStrictEqual([
      `ERROR "grayscale" ${filter}`,
    ]);
    expect(at("basis(theme-classes)", "brightness-50")).toStrictEqual([
      `ERROR "brightness-50" ${filter}`,
    ]);
    expect(at("basis(theme-classes)", "!p-4")).toStrictEqual([
      `ERROR "!p-4" forces its style with !important over the theme's: drop the !, and where a component's own style wins, set its variant or size instead, as vp run docs NAME shows them.`,
    ]);
    expect(at("basis(theme-classes)", "[&>*]:p-4")).toStrictEqual([
      `ERROR "[&>*]:p-4" styles other elements through a selector, where no check can see them: put the class on each element it is for, or render them with a component whose variant gives the look.`,
    ]);
  });

  test("refuses a class built from a template string on a plain element", () => {
    expect(at("basis(theme-classes)", "p-${")).toStrictEqual([
      'ERROR a class built at run time, as from a template string, is one no check can read and Tailwind may never generate: write each class whole and choose between them with a condition, as cn("p-2", wide && "p-4") with cn from @basis/ui.',
    ]);
  });

  test("sends an unknown class, an arbitrary value and a style to the theme, never to src/styles.css", () => {
    expect(at("shadcn(no-unknown-classes)", "flexx")).toStrictEqual([
      `ERROR "flexx" is no class or variant @basis/ui's theme generates, and an app declares none of its own: fix its spelling (closest: flex), or take the look from a component's variant or a theme token, which vp run docs --search WORDS finds.`,
    ]);
    expect(at("shadcn(no-arbitrary-values)", "p-[12px]")).toStrictEqual([
      `ERROR "p-[12px]" is a value off @basis/ui's theme, and an app declares no tokens or scales of its own: use p-4 instead, and for a colour the token named by its meaning, as text-loss for red or bg-muted for grey.`,
    ]);
    expect(at("shadcn(no-inline-styles)", 'color: "red"')).toStrictEqual([
      "ERROR this style sets color outside @basis/ui's theme: a style may set only a CSS variable that a class reads, as --fill read by w-(--fill), to a size and never a colour, and every other look comes from a component's variant or a theme token.",
    ]);
    const text = found.map(({ help, message }) => `${message} ${help ?? ""}`).join("\n");
    expect(text).not.toContain("styles.css");
    expect(text).not.toContain("declare it");
  });
});

describe("the preset's lint against dates, rounding, network calls and libraries the design rejects", () => {
  test("refuses a date formatted by hand, naming DateTime and relativeTime", () => {
    const dateHelp =
      "ERROR an app never formats a date or time itself: show it with DateTime from @basis/ui, whose show prop picks the date or the time, how long ago with relativeTime from @basis/ui/dates, or as text with a Temporal value's toString().";
    expect(at("eslint(no-restricted-properties)", "toLocaleDateString")).toStrictEqual([
      `'toLocaleDateString' is restricted from being used. ${dateHelp}`,
      `'Intl.DateTimeFormat' is restricted from being used. ${dateHelp}`,
    ]);
  });

  test("refuses rounding to decimals by hand, naming the formatter and roundToTick", () => {
    expect(at("basis(no-hand-rounding)", "Math.ceil")).toStrictEqual([
      'ERROR Math.ceil(n * 100) / 100 rounds a number to decimals by hand, which an app never does: show it with Num, Money, Pct, Bps or Price32 from @basis/ui, or as text with numberText(value, { decimals }), which round once for display by the formatter\'s rule, and round a value to a step, as a price to 0.01, with roundToTick(value, 0.01, "ceiling") from @basis/ui/numbers.',
    ]);
  });

  test("refuses XMLHttpRequest, WebSocket, sendBeacon, and fetch in src/api", () => {
    const client =
      "ERROR feature code calls the API only through the generated client: import the operation's hook from src/api/client.ts.";
    expect(at("basis(no-fetch)", "XMLHttpRequest")).toStrictEqual([
      client,
      "ERROR an app reaches its API only through the generated client, and a basis API serves no WebSocket: poll the operation's hook with refetchInterval, imported from src/api/client.ts.",
    ]);
    expect(at("basis(no-fetch)", "sendBeacon")).toStrictEqual([client]);
    expect(inClient("basis(no-fetch)", "fetch(")).toStrictEqual([
      "ERROR src/api holds the generated client and the files that re-export it, which call the API through @basis/ui's apiFetch: call no fetch here, and for an operation the client lacks, pull the API's new openapi.json with vp run client-pull.",
    ]);
  });

  test.each([
    [
      "recharts",
      "ERROR basis-ui decided against Recharts, since a second chart library means a second look and formatter: draw the chart with Chart from @basis/parallax; vp run docs Chart shows it.",
    ],
    [
      "react-hook-form",
      "ERROR basis-ui decided against React Hook Form, which the React Compiler cannot optimize: build the form with useForm from @tanstack/react-form and Field from @basis/ui; vp run docs Field shows it.",
    ],
    [
      "sonner",
      "ERROR basis-ui decided against Sonner, since Base UI ships a toast: raise it with toast from @basis/ui, under one Toaster; vp run docs toast shows it.",
    ],
    [
      "react-aria-components",
      "ERROR basis-ui decided against react-aria-components as a second component base, since one base keeps every component alike: use @basis/ui's components, which are on Base UI, and find one with vp run docs --search WORDS.",
    ],
  ])("refuses an import of %s, which the design decided against", (name, message) => {
    expect(at("eslint(no-restricted-imports)", `from "${name}"`)).toStrictEqual([
      `'${name}' import is restricted from being used. ${message}`,
    ]);
  });
});
