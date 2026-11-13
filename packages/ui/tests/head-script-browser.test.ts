/* The head script's browser floor: in a browser without `Temporal`, which Chrome and Edge ship from 144, the app's
 * modules fail as they load and React draws nothing, so the head script, which runs before any module, puts a line in
 * the page that names the browser it needs. Run as preferences.test.ts runs the rest of it, in a context of its own
 * with fakes of the globals it reads. */

import { runInNewContext } from "node:vm";

import { describe, expect, test } from "vite-plus/test";

import { headScript } from "#index.ts";

import { fakeRoot } from "./preferences-fakes.ts";

const chrome139 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const edge139 = `${chrome139} Edg/139.0.3405.86`;
const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

interface Drawn {
  /** The text the page's body was given, or `undefined` while it keeps its own. */
  readonly text: string | undefined;
  /** The events the script listened for on the document. */
  readonly listened: readonly string[];
}

/** Runs the head script in a page whose browser is `userAgent`, with or without `Temporal`, lets the document finish
 * loading, and returns what it drew. */
function load(userAgent: string, temporal: boolean): Drawn {
  const listeners = new Map<string, () => void>();
  const drawn: string[] = [];
  const document = {
    addEventListener: (event: string, listener: () => void): void => {
      listeners.set(event, listener);
    },
    body: {
      replaceChildren: (child: { readonly textContent: string }): void => {
        drawn.push(child.textContent);
      },
    },
    cookie: "",
    createElement: (): object => ({ textContent: "" }),
    documentElement: fakeRoot(),
  };
  runInNewContext(headScript, {
    document,
    matchMedia: (): { readonly matches: boolean } => ({ matches: false }),
    navigator: { userAgent },
    ...(temporal ? {} : { Temporal: undefined }),
  });
  listeners.get("DOMContentLoaded")?.();
  return { listened: [...listeners.keys()], text: drawn.at(-1) };
}

describe("the head script, in a browser older than the app needs", () => {
  test("names the browser it needs, and the one it found, in Chrome", () => {
    expect(load(chrome139, false).text).toBe(
      "This app needs Chrome or Edge 144 or later, and this is Chrome 139: update the browser, then reload the page.",
    );
  });

  test("names Edge as Edge, though its user agent names Chrome as well", () => {
    expect(load(edge139, false).text).toBe(
      "This app needs Chrome or Edge 144 or later, and this is Edge 139: update the browser, then reload the page.",
    );
  });

  test("names what it needs alone in a browser it cannot name", () => {
    expect(load(firefox, false).text).toBe(
      "This app needs Chrome or Edge 144 or later: open it in one of them, then reload the page.",
    );
  });

  test("leaves the page to the app in a browser that has Temporal", () => {
    expect(load(chrome139, true)).toStrictEqual({ listened: [], text: undefined });
  });
});
