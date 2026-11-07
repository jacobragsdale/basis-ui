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

/** The telemetry `BasisApp` was given, for the components inside it. */
const TelemetryContext = createContext<Telemetry>(consoleTelemetry);

/** The app's telemetry, as `BasisApp` was given it: `useTelemetry().event("position.created", { book })`. */
function useTelemetry(): Telemetry {
  return use(TelemetryContext);
}

export { TelemetryContext, consoleTelemetry, useTelemetry };
export type { Telemetry, TelemetryAttributes };
