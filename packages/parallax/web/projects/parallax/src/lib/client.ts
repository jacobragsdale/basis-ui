/** Angular access to parallax's engine, which runs in a Web Worker in the page. */

import { Injectable, InjectionToken, inject, makeEnvironmentProviders, provideEnvironmentInitializer } from "@angular/core";
import type { EnvironmentProviders } from "@angular/core";

import { BrowserEngine } from "./browser-engine";
import type { ExportFormat, LoadOptions, Loaded } from "./browser-engine";
import type { Connection } from "./connection";
import type { ParallaxTheme, Scheme } from "./theme";

/** Where the engine's worker is served from, and the defaults of every component. */
export interface ParallaxConfig {
  /**
   * Where the application serves `worker.js` from the package's `wasm` folder, such as `/parallax/worker.js`. The
   * engine runs in that worker, on the data the app loads with `ParallaxClient.load`.
   */
  readonly worker: string;
  /**
   * Starts the worker when the application starts, rather than when the app first loads data or a view opens, so
   * that the first rows show sooner. Every page then downloads the engine, about 1 MB compressed, and runs its worker,
   * whether or not it shows parallax. Off by default.
   */
  readonly prewarm?: boolean;
  /** The theme of every grid, pivot and chart that sets none itself. By default the standard theme. */
  readonly theme?: ParallaxTheme;
  /** The light or dark scheme of every component that sets none itself, or `auto` to follow the system. By default light. */
  readonly scheme?: Scheme;
}

const CONFIG = new InjectionToken<ParallaxConfig>("parallax config");

/** The application's configuration, or null where `provideParallax` was not called, such as in a test of one component. */
export function injectParallaxConfig(): ParallaxConfig | null {
  return inject(CONFIG, { optional: true });
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

/** The application's engine, started on first use. It needs `provideParallax`. */
@Injectable({ providedIn: "root" })
export class ParallaxClient {
  private readonly config = inject(CONFIG);
  private browser: BrowserEngine | null = null;

  /** Starts the engine's worker before any data or view needs it. */
  public prewarm(): void {
    this.engine();
  }

  /**
   * Loads Arrow IPC stream bytes the app fetched, such as its API's response, into the engine as `dataset`; views of
   * it then run there. The buffer moves to the engine's worker, so the app can no longer read it. `bytes` may be a
   * promise of them, such as a fetch still on its way: views that open meanwhile wait for the load rather than fail.
   * See `BrowserEngine.load` for the limits and the load's status.
   */
  public load(dataset: string, bytes: ArrayBuffer | PromiseLike<ArrayBuffer>, options: LoadOptions = {}): Promise<Loaded> {
    return this.engine().load(dataset, bytes, options);
  }

  /** Writes a view of a table the app loaded as xlsx or CSV in the engine; see `BrowserEngine.export`. */
  public export(layoutJson: string, format: ExportFormat, loadVersion: bigint | null): Promise<Blob> {
    return this.engine().export(layoutJson, format, loadVersion);
  }

  /** Calls `listener` whenever the engine runs out of memory and starts again empty, so the app can load its data again. */
  public onRestart(listener: (reason: string) => void): void {
    this.engine().onRestart(listener);
  }

  /** The engine, started on first use. */
  private engine(): BrowserEngine {
    this.browser ??= BrowserEngine.start(this.config.worker);
    return this.browser;
  }

  /**
   * Returns the connection for views of `dataset`, once the app's load of it has succeeded. A load still in flight is
   * waited for, and one that fails, or no load at all, fails the view with the reason.
   */
  public async connectionFor(dataset: string): Promise<Connection> {
    const engine = this.engine();
    if (!(await engine.holds(dataset))) {
      throw new Error(`${dataset} is not loaded in this page; the app loads it with ParallaxClient.load before showing it`);
    }
    return engine.connection;
  }
}
