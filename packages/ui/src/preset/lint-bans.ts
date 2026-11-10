/* What the preset's lint refuses in an app, each with a message that names the fix (docs/design.md, The idea): the
 * libraries @basis/ui replaces and those the design decided against, the generated files outside the client layer,
 * `fetch` and the browser's other ways out to the network, display rounding and date formatting, and Vitest's browser
 * API outside a browser-only test. lint.ts and lint-plugin.ts apply them. */

/* The libraries @basis/ui's utilities and icons replace, so that no app adds them back (docs/design.md, Utilities
 * and Dependencies and the supply chain), and the HTTP client that would bypass the generated one. Each message names
 * what to use instead. */
const bannedImports = [
  ...["lodash", "lodash-es", "underscore", "es-toolkit", "remeda", "radash"].map((name) => ({
    message:
      "Use @basis/ui/utils, or a native API: Object.groupBy, structuredClone, the Set methods, toSorted; vp run docs @basis/ui/utils lists the module.",
    name,
  })),
  ...["moment", "date-fns", "dayjs", "luxon", "@date-fns/tz"].map((name) => ({
    message:
      "Use Temporal and @basis/ui/dates, whose business days follow SIFMA by default, then NYSE and TARGET2.",
    name,
  })),
  ...["decimal.js", "decimal.js-light", "big.js", "bignumber.js"].map((name) => ({
    message:
      "Every number an API sends is a double: show it with Num, Money, Pct, Bps or Price32 from @basis/ui, and total it with sumPrecise from @basis/ui/numbers.",
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
  /* The libraries the design decided against (docs/design.md, Decided against), each with what replaces it; the
   * drift check refuses them in package.json too (dependencies.ts). */
  {
    message:
      "ERROR basis-ui decided against Recharts, since a second chart library means a second look and formatter: draw the chart with Chart from @basis/parallax; vp run docs Chart shows it.",
    name: "recharts",
  },
  {
    message:
      "ERROR basis-ui decided against React Hook Form, which the React Compiler cannot optimize: build the form with useForm from @tanstack/react-form and Field from @basis/ui; vp run docs Field shows it.",
    name: "react-hook-form",
  },
  {
    message:
      "ERROR basis-ui decided against Sonner, since Base UI ships a toast: raise it with toast from @basis/ui, under one Toaster; vp run docs toast shows it.",
    name: "sonner",
  },
  ...["react-aria", "react-aria-components", "react-stately"].map((name) => ({
    message: `ERROR basis-ui decided against ${name} as a second component base, since one base keeps every component alike: use @basis/ui's components, which are on Base UI, and find one with vp run docs --search WORDS.`,
    name,
  })),
];
/* Display rounding, which only the number components and parallax do, once, by the formatter's rule
 * (docs/design.md, Numbers). Each message names the component to use instead. */
const showWithComponents =
  "show it with Num, Money, Pct, Bps or Price32 from @basis/ui, or as text with numberText(value, { decimals }), which round once for display by the formatter's rule";
const showDates =
  "show it with DateTime from @basis/ui, whose show prop picks the date or the time, how long ago with relativeTime from @basis/ui/dates, or as text with a Temporal value's toString()";
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
  ...["toLocaleDateString", "toLocaleTimeString"].map((property) => ({
    message: `ERROR an app never formats a date or time itself: ${showDates}.`,
    property,
  })),
  ...["DateTimeFormat", "RelativeTimeFormat"].map((property) => ({
    message: `ERROR an app never formats a date or time itself: ${showDates}.`,
    object: "Intl",
    property,
  })),
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
  {
    group: ["@react-aria/*", "@react-stately/*"],
    message:
      "ERROR basis-ui decided against React Aria as a second component base: use @basis/ui's components, which are on Base UI, and find one with vp run docs --search WORDS.",
  },
];
/* The generated client's own files, however the import names them (`#api/generated/...`, `../api/generated/...`):
 * outside `src/api`, code imports the client through `src/api/client.ts`, which `vp run client-pull` never rewrites. */
const generatedImports = {
  message:
    "ERROR import the generated client through src/api/client.ts, not from src/api/generated, which vp run client-pull rewrites.",
  regex: "(?:^|[/#])api/generated(?:/|$)",
};
/* `fetch`, also as `globalThis.fetch` or `window.fetch`, and the browser's other ways out to the network: an app
 * reaches its API only through the generated client, whose mutator, @basis/ui's `apiFetch`, attaches the user's token
 * and parses every response by its schema; in src/api too, which holds only the client's re-exports. */
const bannedFetch = {
  message:
    "ERROR feature code calls the API only through the generated client: import the operation's hook from src/api/client.ts.",
  name: "fetch",
};
const clientOnly =
  "ERROR src/api holds the generated client and the files that re-export it, which call the API through @basis/ui's apiFetch: call no fetch here, and for an operation the client lacks, pull the API's new openapi.json with vp run client-pull.";
/** The network APIs besides `fetch`, by the global that opens one, with what to use instead. */
const bannedNetwork: Readonly<Record<string, string>> = {
  EventSource:
    "ERROR an app reaches its API only through the generated client, and a basis API serves no event stream: poll the operation's hook with refetchInterval, imported from src/api/client.ts.",
  WebSocket:
    "ERROR an app reaches its API only through the generated client, and a basis API serves no WebSocket: poll the operation's hook with refetchInterval, imported from src/api/client.ts.",
  XMLHttpRequest: bannedFetch.message,
  sendBeacon: bannedFetch.message,
};

export {
  bannedFetch,
  bannedNetwork,
  clientOnly,
  bannedImports,
  bannedPatterns,
  bannedRounding,
  browserOnly,
  showWithComponents,
  browserTestImports,
  generatedImports,
};
