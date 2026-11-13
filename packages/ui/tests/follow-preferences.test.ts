/* followPreferences and writePreferences on a page: a change another app on the shared domain makes reaches it, and
 * the cookie sits on the shared domain when the page is on it. The page is a stand-in, since a test in Chromium has one
 * origin and a cookie store on it; in Chromium 158 a sibling subdomain's change does reach the cookie store's change
 * event over HTTPS (docs/design.md, The theme). */

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  followPreferences,
  parsePreferences,
  preferencesCookie,
  writePreferences,
} from "#index.ts";
import type { Preferences } from "#index.ts";

import { fakeRoot, state } from "./preferences-fakes.ts";
import type { FakeRoot } from "./preferences-fakes.ts";

const light: Preferences = {
  density: "comfortable",
  mode: "light",
  motion: "full",
  theme: "default",
};

/** A cookie in `CookieJar`: host-only when `domain` is `null`. */
interface JarCookie {
  readonly name: string;
  value: string;
  readonly domain: string | null;
}

/** A `document.cookie` assignment read: the cookie, its domain, `null` for none, and whether it removes the cookie. */
function assignmentOf(assignment: string): JarCookie & { readonly removes: boolean } {
  const [pair = "", ...attributes] = assignment.split(";").map((part) => part.trim());
  const separator = pair.indexOf("=");
  const domain = attributes.find((attribute) => attribute.startsWith("Domain="));
  return {
    domain: domain === undefined ? null : domain.slice("Domain=".length),
    name: pair.slice(0, separator),
    removes: attributes.includes("Max-Age=0"),
    value: pair.slice(separator + 1),
  };
}

/** The page's cookies as a browser keeps them, enough for the preferences: a cookie is its name and its domain, or none
 * for one the page keeps for itself, `Max-Age=0` removes it, and `document.cookie` lists them oldest first, as Chromium
 * does for cookies of one path. */
class CookieJar {
  public readonly cookies: JarCookie[] = [];

  public get cookie(): string {
    return this.cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  }

  public set cookie(assignment: string) {
    const { name, value, domain, removes } = assignmentOf(assignment);
    const index = this.cookies.findIndex((one) => one.name === name && one.domain === domain);
    const existing = this.cookies[index];
    if (removes) {
      this.cookies.splice(index, index === -1 ? 0 : 1);
    } else if (existing === undefined) {
      this.cookies.push({ domain, name, value });
    } else {
      existing.value = value;
    }
  }
}

const shared = "apps.example.com";

type Target = "document" | "store" | "window";

/** The page's document, cookie store and window as event targets, counting the listeners on them. */
interface Events {
  readonly listening: () => number;
  readonly fire: (target: Target, type: string) => void;
  /** `addEventListener` and `removeEventListener` on `target`. */
  readonly of: (target: Target) => Pick<EventTarget, "addEventListener" | "removeEventListener">;
}

function fakeEvents(): Events {
  const targets: Readonly<Record<Target, EventTarget>> = {
    document: new EventTarget(),
    store: new EventTarget(),
    window: new EventTarget(),
  };
  let count = 0;
  return {
    fire: (target, type) => {
      targets[target].dispatchEvent(new Event(type));
    },
    listening: () => count,
    of: (target) => ({
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
        count += 1;
        targets[target].addEventListener(type, listener);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
        count -= 1;
        targets[target].removeEventListener(type, listener);
      },
    }),
  };
}

/** A page for `followPreferences` and `writePreferences`: its root element, its cookies, which `otherApp` changes as
 * another app on the shared domain would, its events, and whether it is shown. */
interface FakePage {
  readonly root: FakeRoot;
  readonly jar: CookieJar;
  readonly events: Events;
  readonly otherApp: (value: string) => void;
  readonly hide: (hidden: boolean) => void;
}

/** Puts the page's globals in place: `document`, `matchMedia`, which says the system is light, `location` at `host`,
 * the window's listeners, and a cookie store when `store` says, as a page served over HTTPS has. */
function stubGlobals({
  document,
  events,
  host,
  store,
}: {
  readonly document: object;
  readonly events: Events;
  readonly host: string;
  readonly store: boolean;
}): void {
  const window = events.of("window");
  vi.stubGlobal("document", document);
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: false }));
  vi.stubGlobal("location", { hostname: host });
  vi.stubGlobal("addEventListener", window.addEventListener);
  vi.stubGlobal("removeEventListener", window.removeEventListener);
  vi.stubGlobal("cookieStore", store ? events.of("store") : undefined);
}

/** A page at `host`, an app's on the shared domain unless named, with a cookie store unless `store` is false. */
function fakePage(store = true, host = `positions.${shared}`): FakePage {
  const root = fakeRoot();
  const jar = new CookieJar();
  const events = fakeEvents();
  const document = {
    ...events.of("document"),
    get cookie(): string {
      return jar.cookie;
    },
    set cookie(assignment: string) {
      jar.cookie = assignment;
    },
    documentElement: root,
    visibilityState: "visible",
  };
  stubGlobals({ document, events, host, store });
  return {
    events,
    hide: (hidden) => {
      document.visibilityState = hidden ? "hidden" : "visible";
    },
    jar,
    otherApp: (value) => {
      jar.cookie = `${preferencesCookie}=${value}; Path=/; Domain=${shared}`;
    },
    root,
  };
}

/** Each of the jar's cookies' domains, `null` for one an app keeps for itself. */
function domainOf(jar: CookieJar): (string | null)[] {
  return jar.cookies.map(({ domain }) => domain);
}

describe("followPreferences follows a change made in another app on the shared domain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("through the cookie store's change event, which reaches a window left open in view", () => {
    const fake = fakePage();
    const stop = followPreferences();
    fake.otherApp("dark.comfortable.full.default");
    fake.events.fire("store", "change");
    expect(state(fake.root)).toMatchObject({ dark: true, density: "comfortable" });
    stop();
  });

  test("without a cookie store, as over plain HTTP, when the window takes the focus", () => {
    const fake = fakePage(false);
    const stop = followPreferences();
    expect(state(fake.root)).toMatchObject({ dark: false, density: "compact" });
    fake.otherApp("dark.comfortable.full.default");
    fake.events.fire("window", "focus");
    expect(state(fake.root)).toMatchObject({ dark: true, density: "comfortable" });
    stop();
  });

  test("without a cookie store, when the page is shown again, and not while it is hidden", () => {
    const fake = fakePage(false);
    const stop = followPreferences();
    fake.otherApp("dark.compact.reduced.default");
    fake.hide(true);
    fake.events.fire("document", "visibilitychange");
    const hidden = state(fake.root);
    fake.hide(false);
    fake.events.fire("document", "visibilitychange");
    expect([hidden, state(fake.root)]).toMatchObject([
      { dark: false, motion: undefined },
      { dark: true, motion: "reduced" },
    ]);
    stop();
  });

  test("and stops listening when told to", () => {
    const fake = fakePage();
    followPreferences()();
    expect(fake.events.listening()).toBe(0);
    fake.otherApp("dark.comfortable.full.default");
    fake.events.fire("window", "focus");
    expect(state(fake.root)).toMatchObject({ dark: false });
  });

  test("but not a page given the preferences to show, which follows only the operating system", () => {
    const fake = fakePage();
    const stop = followPreferences(light);
    fake.otherApp("dark.compact.full.default");
    fake.events.fire("store", "change");
    fake.events.fire("window", "focus");
    expect(state(fake.root)).toMatchObject({ dark: false, density: "comfortable" });
    expect(fake.events.listening()).toBe(0);
    stop();
  });
});

describe("the shared domain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("writePreferences stores the choice on it, removing the one this app kept for itself", () => {
    const fake = fakePage();
    fake.jar.cookie = `${preferencesCookie}=light.compact.full.default; Path=/`;
    writePreferences({ ...light, mode: "dark" }, { domain: shared });
    expect(domainOf(fake.jar)).toStrictEqual([shared]);
    expect(parsePreferences(fake.jar.cookie)).toStrictEqual({ ...light, mode: "dark" });
  });

  test("writePreferences keeps the choice this app's alone on a host off the domain, such as localhost", () => {
    const fake = fakePage(true, "localhost");
    writePreferences(light, { domain: shared });
    expect(domainOf(fake.jar)).toStrictEqual([null]);
  });

  test("followPreferences moves a choice this app kept for itself onto it", () => {
    const fake = fakePage();
    fake.jar.cookie = `${preferencesCookie}=dark.comfortable.reduced.default; Path=/`;
    const stop = followPreferences(undefined, { domain: shared });
    expect(domainOf(fake.jar)).toStrictEqual([shared]);
    expect(parsePreferences(fake.jar.cookie)).toMatchObject({ mode: "dark", motion: "reduced" });
    stop();
  });

  test("followPreferences lets no older choice of this app's alone hide the shared one, which the browser lists after it", () => {
    const fake = fakePage();
    fake.jar.cookie = `${preferencesCookie}=light.compact.full.default; Path=/`;
    fake.otherApp("dark.comfortable.full.default");
    const stop = followPreferences(undefined, { domain: shared });
    expect(state(fake.root)).toMatchObject({ dark: true, density: "comfortable" });
    expect(domainOf(fake.jar)).toStrictEqual([shared]);
    stop();
  });

  /* A browser lists cookies of one path oldest first (RFC 6265, 5.4), and keeps a cookie's first creation time when it
   * is written again, so which of a host-only and a shared cookie comes first says nothing of which is this app's. */
  test.each([
    ["an older shared one", "shared first"],
    ["a newer shared one", "own first"],
  ])("an app that names no domain keeps its own choice over %s", (_name, order) => {
    const fake = fakePage(false, `trades.${shared}`);
    if (order === "own first") {
      writePreferences({ ...light, density: "compact" });
    }
    fake.otherApp("dark.compact.reduced.default");
    writePreferences(light);
    const stop = followPreferences();
    fake.events.fire("window", "focus");
    expect(domainOf(fake.jar)).toHaveLength(2);
    expect(state(fake.root)).toMatchObject({
      dark: false,
      density: "comfortable",
      motion: undefined,
    });
    stop();
  });
});
