/* What the preset's lint refuses in an app, each with a message that names the fix (docs/design.md, The idea): the
 * libraries @basis/ui replaces, the generated files and `fetch` outside the client layer, display rounding, and
 * Vitest's browser API outside a browser-only test. lint.ts applies them. */

/* The libraries @basis/ui's utilities and icons replace, so that no app adds them back (docs/design.md, Utilities
 * and Dependencies and the supply chain), and the HTTP client that would bypass the generated one. Each message names
 * what to use instead. */
const bannedImports = [
  ...["lodash", "lodash-es", "underscore", "es-toolkit", "remeda", "radash"].map((name) => ({
    message:
      "Use @basis/ui/utils, or a native API: Object.groupBy, structuredClone, the Set methods, toSorted. docs/design.md#utilities.",
    name,
  })),
  ...["moment", "date-fns", "dayjs", "luxon", "@date-fns/tz"].map((name) => ({
    message:
      "Use Temporal and @basis/ui/dates, whose business days follow SIFMA by default, then NYSE and TARGET2.",
    name,
  })),
  ...["decimal.js", "decimal.js-light", "big.js", "bignumber.js"].map((name) => ({
    message:
      "Every number an API sends is a double: show it with Num, Money, Pct, Bps or Price32 from @basis/ui, and total it with sumPrecise from @basis/ui/numbers. docs/design.md#numbers.",
    name,
  })),
  {
    message:
      "Import icons from @basis/ui under lucide's names; add a missing one to @basis/ui, as its README says.",
    name: "lucide-react",
  },
  {
    message:
      "ERROR feature code calls the API only through the generated client: import the operation's hook from src/api/client.ts.",
    name: "axios",
  },
];
/* Display rounding, which only the number components and parallax do, once, by the formatter's rule
 * (docs/design.md, Numbers). Each message names the component to use instead. */
const showWithComponents =
  "show it with Num, Money, Pct, Bps or Price32 from @basis/ui, or as text with numberText(value, { decimals }), which round once for display by the formatter's rule (docs/design.md#numbers)";
const bannedRounding = [
  {
    message: `ERROR an app never rounds a number for display: ${showWithComponents}.`,
    property: "toFixed",
  },
  {
    message: `ERROR an app never rounds a number for display: ${showWithComponents}.`,
    property: "toPrecision",
  },
  {
    message: `ERROR an app never formats a number or a date itself: ${showWithComponents}, and a date or time with DateTime.`,
    property: "toLocaleString",
  },
  {
    message: `ERROR an app never formats a number itself: ${showWithComponents}.`,
    object: "Intl",
    property: "NumberFormat",
  },
  {
    message: `ERROR an app never rounds a number for display: ${showWithComponents}; for an integer that is not shown, such as an index or a pixel count, use Math.floor or Math.trunc.`,
    object: "Math",
    property: "round",
  },
];

/* A test runs both in Chromium and in a Node DOM (docs/design.md, Consumers), so it is written with
 * @basis/ui/testing; Vitest's browser API, which only Chromium runs, belongs only in a `*.browser.test.tsx` file. */
const browserOnly =
  "ERROR a test runs with and without a browser: write it with render, screen and userEvent from @basis/ui/testing, or, if it needs a real browser for layout, focus or pixels, name its file *.browser.test.tsx.";
const browserTestImports = [
  "vitest-browser-react",
  "vitest/browser",
  "@vitest/browser",
  "@vitest/browser/context",
  "vite-plus/test/browser",
].map((name) => ({ message: browserOnly, name }));

const bannedPatterns = [
  {
    group: ["lodash/*", "lodash.*", "es-toolkit/*"],
    message: "Use @basis/ui/utils or a native API.",
  },
  {
    group: ["date-fns/*", "dayjs/*", "moment/*"],
    message: "Use Temporal and @basis/ui/dates.",
  },
  { group: ["lucide-react/*"], message: "Import icons from @basis/ui." },
];
/* The generated client's own files, however the import names them (`#api/generated/...`, `../api/generated/...`):
 * outside `src/api`, code imports the client through `src/api/client.ts`, which `vp run client-pull` never rewrites. */
const generatedImports = {
  message:
    "ERROR import the generated client through src/api/client.ts, not from src/api/generated, which vp run client-pull rewrites.",
  regex: "(?:^|[/#])api/generated(?:/|$)",
};
/* `fetch`, also as `globalThis.fetch` or `window.fetch`: feature code reaches the API only through the generated client,
 * whose mutator, @basis/ui's `apiFetch`, attaches the user's token and parses every response by its schema. */
const bannedFetch = {
  message:
    "ERROR feature code calls the API only through the generated client: import the operation's hook from src/api/client.ts.",
  name: "fetch",
};

export {
  bannedFetch,
  bannedImports,
  bannedPatterns,
  bannedRounding,
  browserOnly,
  browserTestImports,
  generatedImports,
};
