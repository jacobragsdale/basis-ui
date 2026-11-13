/* The app's `vp dev` for `vp run shot`: the one already running on the app's own port, or one it starts in fixture
 * mode and stops after. A `vp dev` names its app's root at `rootPath`, so the task never pictures another app, or
 * another program, that holds the port. One it starts writes its output to the task's error output, so the problems it
 * prints, such as a fixture's, reach whoever runs the task, and a `vp dev` that stops, or never starts, fails the task
 * at once. */

import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { Socket } from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { rootPath } from "./fixture-mode.ts";
import { TaskError } from "./task-error.ts";
import { binOf } from "./verify-tools.ts";

/** How long a `vp dev` this task starts may take to answer, how often it is asked, and how long one answer may take. */
const startSeconds = 60;
const millisecondsPerSecond = 1000;
const startMs = startSeconds * millisecondsPerSecond;
const pollMs = 250;
const answerMs = millisecondsPerSecond;

/** What `url` answers within a second, if it answers with success. */
async function answer(url: string): Promise<string | undefined> {
  try {
    // oxlint-disable-next-line basis/no-fetch -- this asks the app's own dev server, in Node, outside any app's client.
    const response = await fetch(url, { signal: AbortSignal.timeout(answerMs) });
    return response.ok ? await response.text() : undefined;
  } catch {
    return undefined;
  }
}

/** Who answers at an app's port: its own `vp dev`, another app's, something else, or nothing. */
type Answering =
  | { readonly kind: "this" }
  | { readonly kind: "another"; readonly root: string }
  | { readonly kind: "other" }
  | { readonly kind: "nothing" };

/** Who answers at `origin`, for the app at `root`. */
async function answering(origin: string, root: string): Promise<Answering> {
  const named = await answer(`${origin}${rootPath}`);
  if (named !== undefined && path.isAbsolute(named)) {
    return path.resolve(named) === path.resolve(root)
      ? { kind: "this" }
      : { kind: "another", root: path.resolve(named) };
  }
  const page = await answer(origin);
  return page === undefined ? { kind: "nothing" } : { kind: "other" };
}

/** What starts `vp dev`, and where its output goes, which a test replaces. */
interface DevCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly output?: NodeJS.WritableStream;
}

/** `vp dev` from the app's own Vite+, its script run by this Node, so no shell or PATH is needed, on Windows too, as
 * `vp run verify` runs its tools. */
function vpDev(root: string): DevCommand {
  return {
    args: [binOf(root, "vite-plus", "bin/vp"), "dev", "--strictPort"],
    command: process.execPath,
  };
}

/** Ends `pid` and everything it started: on Windows, which has no process groups, with `taskkill /T`; elsewhere by its
 * process group, which `detached` gave it. */
function killTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // It ended already.
  }
}

/** Stops a `vp dev` this task started, and everything it started, once: when the task asks, when it is interrupted, or
 * when it exits any other way. Its pipes are closed with it, so they never hold the task open. */
function stopper(child: ChildProcess): () => void {
  let stopped = false;
  const on = {
    interrupted: (signal: NodeJS.Signals): void => {
      on.stop();
      // Raised again, with no listener left, so the task ends as the signal ends any process.
      process.kill(process.pid, signal);
    },
    stop: (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      // The tree first, so a signal that arrives once the listeners are gone cannot end the task before it.
      if (child.pid !== undefined) {
        killTree(child.pid);
      }
      child.stdout?.destroy();
      child.stderr?.destroy();
      process.off("exit", on.stop);
      process.off("SIGINT", on.interrupted);
      process.off("SIGTERM", on.interrupted);
    },
  };
  process.once("exit", on.stop);
  process.once("SIGINT", on.interrupted);
  process.once("SIGTERM", on.interrupted);
  return on.stop;
}

/** Lets the task end while `child` runs and its pipes stay open, as a `vp dev` that answered does until it is
 * stopped: its output still reaches the task's, and stopping it is the task's to do, never the event loop's. */
function released(child: ChildProcess): void {
  child.unref();
  for (const stream of [child.stdout, child.stderr]) {
    if (stream instanceof Socket) {
      stream.unref();
    }
  }
}

/** How a `vp dev` this task started came out: answering, stopped with its exit code, never started, or still silent. */
type Started =
  | { readonly kind: "up" }
  | { readonly kind: "stopped"; readonly code: number | null }
  | { readonly kind: "failed"; readonly error: Error }
  | { readonly kind: "silent" };

/** A `vp dev` this task started, and how it ended, once it has. */
interface Child {
  readonly child: ChildProcess;
  readonly ended: () => Started | undefined;
}

/** Starts `vp dev`, its output written to `output`, and records how it ends: unable to start, or stopped once its
 * output has all arrived, not merely once it exits. */
function start({ command, args, output = process.stderr }: DevCommand): Child {
  // Detached outside Windows, so that it leads a process group that stopping it ends. On Windows that would give it a
  // console window of its own, and `taskkill /T` ends its tree without one.
  const child = spawn(command, args, {
    detached: process.platform !== "win32",
    env: { ...process.env, BASIS_API_URL: "" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let ended: Started | undefined = undefined;
  child.on("error", (error) => {
    ended = { error, kind: "failed" };
  });
  child.on("close", (code) => {
    ended ??= { code, kind: "stopped" };
  });
  child.stdout?.pipe(output, { end: false });
  child.stderr?.pipe(output, { end: false });
  return { child, ended: () => ended };
}

/** How `started` comes out: up once this app's `vp dev` answers at `origin`, else how it ended, or silent once
 * `startMs` passes, asking every `pollMs`. */
async function cameUp(
  { origin, root }: { readonly origin: string; readonly root: string },
  started: Child,
  waited = 0,
): Promise<Started> {
  const ended = started.ended();
  if (ended !== undefined) {
    return ended;
  }
  if (waited >= startMs) {
    return { kind: "silent" };
  }
  const found = await answering(origin, root);
  if (found.kind === "this") {
    return { kind: "up" };
  }
  await sleep(pollMs);
  return cameUp({ origin, root }, started, waited + pollMs);
}

/** The line a `vp dev` this task started fails it with. */
function failureLine(origin: string, outcome: Exclude<Started, { readonly kind: "up" }>): string {
  switch (outcome.kind) {
    case "failed": {
      return `ERROR vp run shot could not start vp dev (${outcome.error.message}): run vp install, then vp run shot again.`;
    }
    case "stopped": {
      return `ERROR vp dev stopped, with exit code ${String(outcome.code)}, before it answered at ${origin}: fix what its output above says, then run vp run shot again.`;
    }
    case "silent": {
      return `ERROR vp dev did not answer at ${origin} within ${String(startSeconds)} s: read its output above, or run vp dev in this app to see why, then run vp run shot again while it runs.`;
    }
    default: {
      return outcome satisfies never;
    }
  }
}

/** Fails the task when another app's `vp dev`, or another program, holds the app's port. */
function refuseOthers(found: Exclude<Answering, { readonly kind: "this" }>, origin: string): void {
  switch (found.kind) {
    case "another": {
      throw new TaskError(
        `ERROR the vp dev of ${found.root} answers at ${origin}, not this app's: stop it, then run vp run shot again.`,
      );
    }
    case "other": {
      throw new TaskError(
        `ERROR something other than this app's vp dev answers at ${origin}: stop the program that holds the port, then run vp run shot again.`,
      );
    }
    case "nothing": {
      break;
    }
    default: {
      found satisfies never;
    }
  }
}

/** A new `vp dev` in fixture mode, once it answers at `origin` as the app at `root`'s, which `stop` ends. */
async function startDevServer(
  origin: string,
  root: string,
  command: DevCommand,
): Promise<{ readonly stop: () => void }> {
  const started = start(command);
  const stop = stopper(started.child);
  const outcome = await cameUp({ origin, root }, started);
  if (outcome.kind === "up") {
    released(started.child);
    return { stop };
  }
  stop();
  throw new TaskError(failureLine(origin, outcome));
}

/** The `vp dev` of the app at `root` at `origin`: the one running, or a new one in fixture mode, which `stop` ends. */
async function devServer(
  origin: string,
  root: string,
  command?: DevCommand,
): Promise<{ readonly stop: () => void }> {
  const found = await answering(origin, root);
  if (found.kind === "this") {
    return { stop: (): void => undefined };
  }
  refuseOthers(found, origin);
  return startDevServer(origin, root, command ?? vpDev(root));
}

export { devServer };
export type { DevCommand };
