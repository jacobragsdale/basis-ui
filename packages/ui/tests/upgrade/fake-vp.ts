/* A stand-in for Vite+'s `vp`, which upgrade.test.ts puts first on the PATH, so `vp run upgrade` runs against a feed
 * of folders rather than a registry. Each call is a line of `FAKE_FEED/log`, its folder written `app` when it is
 * `FAKE_APP` and `elsewhere` when not, such as the folder a dry run installs into.
 *
 *   vp info @basis/ui dist-tags.latest   prints `FAKE_FEED/latest`
 *   vp add [FLAGS] NAME@VERSION...       copies `FAKE_FEED/NAME/VERSION/` to `node_modules/NAME/` and pins it in
 *                                        package.json, in devDependencies with `-D`, or fails as pnpm does when the
 *                                        feed has no such folder
 *   vp install                           passes
 *   vp run sync, vp run verify           log the text of `FAKE_WATCH` too, as each finds it, and exit with
 *                                        `FAKE_SYNC_STATUS` and `FAKE_VERIFY_STATUS`, 0 when unset */

import { appendFileSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const feed = process.env["FAKE_FEED"] ?? "";
const where = process.cwd() === process.env["FAKE_APP"] ? "app" : "elsewhere";
const [command = "", ...args] = process.argv.slice(2);

function log(line: string): void {
  appendFileSync(path.join(feed, "log"), `${line}\n`);
}

const manifestSchema = z.looseObject({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

/** Copies `NAME@VERSION` from the feed into `node_modules`, and says whether the feed has it. */
function copied(spec: string): boolean {
  const at = spec.lastIndexOf("@");
  const source = path.join(feed, spec.slice(0, at), spec.slice(at + 1));
  if (!existsSync(source)) {
    process.stderr.write(`ERR_PNPM_NO_MATCHING_VERSION No matching version found for ${spec}\n`);
    return false;
  }
  const target = path.join(process.cwd(), "node_modules", spec.slice(0, at));
  rmSync(target, { force: true, recursive: true });
  cpSync(source, target, { recursive: true });
  return true;
}

/** Installs each `NAME@VERSION` from the feed, as `vp add` would from a registry, pinned in package.json's
 * `dependencies`, or its `devDependencies` when `dev`. */
function add(specs: readonly string[], dev: boolean): number {
  if (!specs.every((spec) => copied(spec))) {
    return 1;
  }
  const manifestFile = path.join(process.cwd(), "package.json");
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestFile, "utf8")));
  const pinned = specs.map((spec): [string, string] => {
    const at = spec.lastIndexOf("@");
    return [spec.slice(0, at), spec.slice(at + 1)];
  });
  if (dev) {
    manifest.devDependencies = { ...manifest.devDependencies, ...Object.fromEntries(pinned) };
  } else {
    manifest.dependencies = { ...manifest.dependencies, ...Object.fromEntries(pinned) };
  }
  writeFileSync(manifestFile, JSON.stringify(manifest));
  return 0;
}

/** `vp run sync` or `vp run verify`: logs the watched file as the task finds it, and exits as its variable says. */
function task(name: "sync" | "verify"): number {
  const watched = process.env["FAKE_WATCH"];
  if (watched !== undefined) {
    const text = readFileSync(path.join(process.cwd(), watched), "utf8");
    log(`${name} saw ${text.trimEnd()}`);
  }
  return Number(process.env[name === "sync" ? "FAKE_SYNC_STATUS" : "FAKE_VERIFY_STATUS"] ?? "0");
}

function main(): number {
  log(`${where} vp ${[command, ...args].join(" ")}`);
  if (command === "info") {
    process.stdout.write(readFileSync(path.join(feed, "latest"), "utf8"));
    return 0;
  }
  if (command === "add") {
    return add(
      args.filter((arg) => !arg.startsWith("-")),
      args.includes("-D"),
    );
  }
  const [name] = args;
  return command === "run" && (name === "sync" || name === "verify") ? task(name) : 0;
}

process.exitCode = main();
