/* The desktop's setup, checked, with the fix for each problem:
 *
 *   vp run doctor   prints one line for each check that passes, then one ERROR line for each that fails, ending with
 *                   its fix
 *
 * It checks git and the clone, that git runs Vite+'s hooks, that the installed packages are the ones package.json pins,
 * that Playwright's Chromium is installed for `vp test` and `vp run shot`, and `BASIS_API_URL` when it is set. */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { z } from "zod";

import { git } from "./git.ts";
import {
  appDependencies,
  chromiumInstall,
  exactVersion,
  ignored,
  installedVersion,
  versionSchema,
} from "./installed.ts";
import { TaskError } from "./task-error.ts";
import { installedUi } from "./sync.ts";

/** One check's outcome: a line saying what it found, or an ERROR line ending with the fix. */
interface Finding {
  readonly ok: boolean;
  readonly line: string;
}

/** The folder Vite+'s hook dispatcher lives in, which `vp config` installs and git's `core.hooksPath` names. */
const hooksPath = ".vite-hooks/_";
/** The packages whose installed version must be the one package.json pins. */
const pinned = new Set(["@basis/ui", "@basis/parallax", "vite-plus", "typescript", "react"]);

function passed(line: string): Finding {
  return { line, ok: true };
}

function failed(line: string): Finding {
  return { line: `ERROR ${line}`, ok: false };
}

/** git, and whether the app's folder is a clone. */
function gitFindings(root: string): readonly Finding[] {
  const version = git(root, ["--version"]);
  if (version === undefined) {
    return [
      failed(
        "git is not on the PATH: install Git, Git for Windows on a Windows desktop, then run vp run doctor again.",
      ),
    ];
  }
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  return top === undefined
    ? [
        passed(version),
        failed(
          "this folder is not a git clone, so no hook runs: clone the app's repo, or run git init, then vp config.",
        ),
      ]
    : [passed(version), passed(`a git clone at ${top}`)];
}

/** Whether git runs the hooks in `.vite-hooks/`: set to Vite+'s folder, which git reads from the clone's top, and
 * that folder holding Vite+'s dispatcher, which `vp config` writes and git does not keep, so a fresh clone or worktree
 * lacks it until `vp install` runs. */
function hooksFinding(root: string): Finding {
  const configured = git(root, ["config", "core.hooksPath"]);
  if (configured !== hooksPath) {
    return failed(
      `git runs its hooks from ${configured ?? "its own folder"}, not Vite+'s ${hooksPath}, so the commit and push hooks never run: run vp config.`,
    );
  }
  const folder = path.join(git(root, ["rev-parse", "--show-toplevel"]) ?? root, hooksPath);
  if (!existsSync(path.join(folder, "h"))) {
    return failed(
      `git runs its hooks from ${hooksPath}, but ${folder} holds no Vite+ hooks, as in a clone or worktree vp install has not run in: run vp install, which runs vp config.`,
    );
  }
  return passed(`git runs the hooks in .vite-hooks/`);
}

/** Each pinned package package.json names, installed at the version it pins. */
async function dependencyFindings(root: string): Promise<readonly Finding[]> {
  const wanted = [...(await appDependencies(root))].filter(([name]) => pinned.has(name));
  const installed = await Promise.all(wanted.map(async ([name]) => installedVersion(root, name)));
  return wanted.map(([name, spec], index) => {
    const version = installed[index];
    if (version === undefined) {
      return failed(`${name} is not installed: run vp install.`);
    }
    return exactVersion.test(spec) && spec !== version
      ? failed(
          `node_modules holds ${name} ${version}, but package.json pins ${spec}: run vp install.`,
        )
      : passed(`${name} ${version}`);
  });
}

/** Playwright's `chromium`, kept as the object it is, since `executablePath` reads its own `this`. */
const playwrightSchema = z.object({
  chromium: z.custom<{ readonly executablePath: () => string }>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "executablePath" in value &&
      typeof value.executablePath === "function",
  ),
});

/** The version of the Playwright `@basis/ui` depends on, and where it puts its Chromium. */
async function playwright(): Promise<{ readonly version: string; readonly executable: string }> {
  const installed = await installedUi();
  const ui = createRequire(path.join(installed.root, "package.json"));
  const manifest = ui.resolve("playwright/package.json");
  const { version } = versionSchema.parse(JSON.parse(await readFile(manifest, "utf8")));
  // Playwright is CommonJS, whose exports an import would give only as `default`.
  const loaded: unknown = ui("playwright");
  return { executable: playwrightSchema.parse(loaded).chromium.executablePath(), version };
}

/** Whether the Chromium that `@basis/ui`'s Playwright pins is installed. */
async function chromiumFinding(): Promise<Finding> {
  const found = await playwright().catch(ignored);
  if (found === null) {
    return failed(
      "Playwright, which @basis/ui runs vp test and vp run shot in, is not installed: run vp install.",
    );
  }
  const { executable, version } = found;
  return existsSync(executable)
    ? passed(`Playwright ${version}'s Chromium, for vp test and vp run shot`)
    : failed(
        `Playwright ${version}'s Chromium is not installed, and vp test and vp run shot run in it: run ${chromiumInstall(version)}.`,
      );
}

/** Where `vp dev` sends `/api`: fixture mode, or a live API at an http or https address. */
function apiFinding(): Finding {
  const target = process.env["BASIS_API_URL"];
  if (target === undefined || target === "") {
    return passed("vp dev runs in fixture mode, since BASIS_API_URL is not set");
  }
  return URL.canParse(target) && /^https?:$/u.test(new URL(target).protocol)
    ? passed(`vp dev calls the API at ${target}, from BASIS_API_URL`)
    : failed(
        `BASIS_API_URL is ${target}, not an http or https address: set it to the API's, such as http://127.0.0.1:8000, or unset it for fixture mode.`,
      );
}

/** `vp run doctor`. */
async function doctor(root: string, args: readonly string[]): Promise<string> {
  if (args.length > 0) {
    throw new TaskError("ERROR vp run doctor takes no arguments: run vp run doctor alone.");
  }
  const findings = [
    ...gitFindings(root),
    hooksFinding(root),
    ...(await dependencyFindings(root)),
    await chromiumFinding(),
    apiFinding(),
  ];
  const errors = findings.filter((finding) => !finding.ok).map((finding) => finding.line);
  const passes = findings.filter((finding) => finding.ok).map((finding) => `ok ${finding.line}`);
  if (errors.length > 0) {
    process.stdout.write(`${passes.join("\n")}\n`);
    throw new TaskError(errors.join("\n"));
  }
  return passes.join("\n");
}

export { doctor };
