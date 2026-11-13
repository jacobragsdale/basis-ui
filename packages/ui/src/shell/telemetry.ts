/* Telemetry: where the app shell reports what happens in an app. `BasisApp` reports every error its error boundary,
 * the router or a failed request meets, and how long each navigation took; an app reports its own events and timings
 * through `useTelemetry()`. The firm's collector will be one more implementation of `Telemetry`; until it exists, and
 * in development and tests, `consoleTelemetry` writes to the browser's console. */

import { createContext, use } from "react";

/** What a report says about itself, such as `{ source: "query", query: "/positions" }`. Values stay flat, so any
 * collector can index them. */
type TelemetryAttributes = Readonly<Record<string, string | number | boolean>>;

/** The three things an app reports. Each call returns at once and never throws, so reporting cannot break the app. */
interface Telemetry {
  /** An error the app met: one the error boundary caught, one the router caught, or a request that failed. */
  readonly error: (error: unknown, attributes?: TelemetryAttributes) => void;
  /** Something that happened, by a dotted name in the past tense, such as `position.created`. */
  readonly event: (name: string, attributes?: TelemetryAttributes) => void;
  /** How long something took, in milliseconds, such as `navigation`, which the shell reports with its route. */
  readonly timing: (name: string, milliseconds: number, attributes?: TelemetryAttributes) => void;
}

/* The console is the whole of this implementation's job, so each method's one call is allowed. */
/** The telemetry `BasisApp` reports to unless given another: each error, event and timing written to the console. */
const consoleTelemetry: Telemetry = {
  error: (error, attributes = {}) => {
    // oxlint-disable-next-line eslint/no-console -- consoleTelemetry reports to the console by design.
    console.error("[telemetry] error", error, attributes);
  },
  event: (name, attributes = {}) => {
    // oxlint-disable-next-line eslint/no-console -- consoleTelemetry reports to the console by design.
    console.info("[telemetry] event", name, attributes);
  },
  timing: (name, milliseconds, attributes = {}) => {
    // oxlint-disable-next-line eslint/no-console -- consoleTelemetry reports to the console by design.
    console.info("[telemetry] timing", name, `${milliseconds.toFixed(0)} ms`, attributes);
  },
};

/** Writes to the console that a collector threw, once per call, since the collector cannot report its own failure. */
function collectorFailed(failure: unknown): void {
  // oxlint-disable-next-line eslint/no-console -- the collector itself failed, so the console is all that is left.
  console.error("[telemetry] the collector threw", failure);
}

/** `telemetry`, each call made safe: a collector that throws is written to the console, and the call returns, so a
 * failing collector never stops what reported to it, such as the toast for a failed save. `BasisApp` gives its
 * components this. */
function guardedTelemetry(telemetry: Telemetry): Telemetry {
  return {
    error: (error, attributes) => {
      try {
        telemetry.error(error, attributes);
      } catch (error_) {
        collectorFailed(error_);
      }
    },
    event: (name, attributes) => {
      try {
        telemetry.event(name, attributes);
      } catch (error) {
        collectorFailed(error);
      }
    },
    timing: (name, milliseconds, attributes) => {
      try {
        telemetry.timing(name, milliseconds, attributes);
      } catch (error) {
        collectorFailed(error);
      }
    },
  };
}

/** Reports the page's errors that nothing else caught, in an event handler or a timer (`source: "page"`) or a promise
 * nobody awaited (`source: "unhandled-rejection"`). The browser still writes each to the console. Returns the
 * unsubscribe. */
function reportPageErrors(telemetry: Telemetry): () => void {
  const uncaught = (event: ErrorEvent): void => {
    telemetry.error(event.error ?? event.message, { source: "page" });
  };
  const unhandled = (event: PromiseRejectionEvent): void => {
    telemetry.error(event.reason, { source: "unhandled-rejection" });
  };
  globalThis.addEventListener("error", uncaught);
  globalThis.addEventListener("unhandledrejection", unhandled);
  return () => {
    globalThis.removeEventListener("error", uncaught);
    globalThis.removeEventListener("unhandledrejection", unhandled);
  };
}

/** The telemetry `BasisApp` was given, for the components inside it. */
const TelemetryContext = createContext<Telemetry>(consoleTelemetry);

/** The app's telemetry, as `BasisApp` was given it: `useTelemetry().event("position.created", { book })`. */
function useTelemetry(): Telemetry {
  return use(TelemetryContext);
}

export { TelemetryContext, consoleTelemetry, guardedTelemetry, reportPageErrors, useTelemetry };
export type { Telemetry, TelemetryAttributes };
