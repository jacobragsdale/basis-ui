/** Angular access to a parallax engine. */

import { Injectable, InjectionToken, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from "@angular/core";
import type { EnvironmentProviders } from "@angular/core";

import { BrowserEngine, COPY_TIMEOUT_MS } from "./browser-engine";
import { Connection } from "./connection";
import type { ParallaxTheme, Scheme } from "./theme";

/** Where the engine runs. */
export interface ParallaxConfig {
  /** The server's WebSocket URL, such as `wss://host/ws`. A path such as `/ws` is resolved against the page. */
  readonly url: string;
  /**
   * The server's HTTP base, such as `https://host/app`, where exports are posted to `/export` and browser copies
   * are fetched from `/copy`. By default, beside `url`: `wss://host/app/ws` gives `https://host/app`.
   */
  readonly httpUrl?: string;
  /**
   * Where the application serves `worker.js` from the package's `wasm` folder, such as `/parallax/worker.js`.
   * With it, datasets the server marks for the browser are copied into a worker and their views run there;
   * without it, every view runs on the server.
   */
  readonly worker?: string;
  /**
   * Connects to the server and starts the worker when the application starts, rather than when a view first needs
   * them, so that a dataset held in the browser shows its first rows sooner: the engine starts without waiting for
   * the server's welcome. Every page then downloads the engine, about 1 MB compressed, and runs its worker, whether
   * or not it opens a dataset held in the browser. Needs `worker`. Off by default.
   */
  readonly prewarm?: boolean;
  /** The theme of every grid, pivot and chart that sets none itself. By default the standard theme. */
  readonly theme?: ParallaxTheme;
  /** The light or dark scheme of every component that sets none itself, or `auto` to follow the system. By default light. */
  readonly scheme?: Scheme;
}

/** The connection a view of one dataset should use. */
export interface Placement {
  readonly connection: Connection;
  /** Why a dataset marked for the browser runs on the server instead, or null. */
  readonly fallback: string | null;
}

const CONFIG = new InjectionToken<ParallaxConfig>("parallax config");

/** The application's configuration, or null where `provideParallax` was not called, such as in a test of one component. */
export function injectParallaxConfig(): ParallaxConfig | null {
  return inject(CONFIG, { optional: true });
}

/** The HTTP base beside a server's WebSocket endpoint: `wss://host/app/ws` gives `https://host/app`. */
export function httpBaseFor(socketUrl: string): string {
  const url = new URL(socketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = url.pathname.replace(/\/ws\/?$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

/** An endpoint under an HTTP base, whether or not the base ends with a slash. */
function endpoint(base: string, path: string): URL {
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path}`;
  return url;
}

/** The export endpoint under the server's HTTP base. */
export function exportUrlFor(base: string): string {
  return endpoint(base, "export").toString();
}

/** The copy endpoint for a dataset and its parameters under the server's HTTP base. */
export function copyUrlFor(base: string, dataset: string, parameters: Readonly<Record<string, string>>): string {
  const url = endpoint(base, `copy/${encodeURIComponent(dataset)}`);
  url.search = new URLSearchParams(Object.entries(parameters)).toString();
  return url.toString();
}

/** Provides the parallax client for an application. */
export function provideParallax(config: ParallaxConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CONFIG, useValue: config },
    ...(config.prewarm === true
      ? [
          provideEnvironmentInitializer(() => {
            inject(ParallaxClient).prewarm();
          })
        ]
      : [])
  ]);
}

function absolute(url: string): string {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${url.startsWith("/") ? url : `/${url}`}`;
}

/** The application's connection to the engine, opened on first use. It needs `provideParallax`. */
@Injectable({ providedIn: "root" })
export class ParallaxClient {
  private readonly config = inject(CONFIG);
  private connecting: Promise<Connection> | null = null;
  private browser: BrowserEngine | null = null;

  /** The server's HTTP base. */
  private httpBase(): string {
    return this.config.httpUrl ?? httpBaseFor(absolute(this.config.url));
  }

  /** The URL exports are posted to. */
  public exportUrl(): string {
    return exportUrlFor(this.httpBase());
  }

  /** Returns the shared connection to the server. */
  public connection(): Promise<Connection> {
    this.connecting ??= Connection.websocket(absolute(this.config.url));
    return this.connecting;
  }

  /** Connects to the server and starts the browser's engine, if there is a worker, before any view needs them. */
  public prewarm(): void {
    // A connection that fails is reported to the views that need it.
    this.connection().catch(() => undefined);
    this.engine();
  }

  /** The browser's engine, started on first use, or null without a worker. */
  private engine(): BrowserEngine | null {
    const worker = this.config.worker;
    if (worker === undefined) {
      return null;
    }
    this.browser ??= BrowserEngine.start(worker);
    return this.browser;
  }

  /**
   * Returns the connection for views of `dataset`: the browser's engine if the server marks the dataset for the
   * browser, a worker is configured and the copy loads; otherwise the server. A copy that fails to load leaves
   * the view on the server, which holds the same table, and says why.
   */
  public async connectionFor(dataset: string, parameters: Readonly<Record<string, string>>): Promise<Placement> {
    return placeView(await this.connection(), () => this.engine(), dataset, parameters, copyUrlFor(this.httpBase(), dataset, parameters));
  }
}

/** What placing a view needs from the browser's engine. */
export interface CopyingEngine {
  readonly connection: Connection;
  readonly copy: (dataset: string, parameters: Readonly<Record<string, string>>, url: string, timeoutMs: number) => Promise<void>;
}

/**
 * Chooses the connection for views of `dataset`. A dataset the server marks for the browser is copied into the
 * engine `browser` returns, if any; a copy that fails leaves the view on the server, which holds the same table.
 */
export async function placeView(server: Connection, browser: () => CopyingEngine | null, dataset: string, parameters: Readonly<Record<string, string>>, copyUrl: string): Promise<Placement> {
  if ((await server.dataset(dataset))?.browser !== true) {
    return { connection: server, fallback: null };
  }
  const engine = browser();
  if (engine === null) {
    return { connection: server, fallback: null };
  }
  try {
    await engine.copy(dataset, parameters, copyUrl, COPY_TIMEOUT_MS);
    return { connection: engine.connection, fallback: null };
  } catch (failure: unknown) {
    const reason = failure instanceof Error ? failure.message : String(failure);
    return { connection: server, fallback: `The copy for this browser did not load, so the view runs on the server: ${reason}` };
  }
}
