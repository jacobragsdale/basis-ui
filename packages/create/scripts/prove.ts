/* Proves the app template: packs @basis/ui, @basis/parallax and @basis/create as an app receives them, makes an app
 * from the packed template outside the workspace, as `vp create @basis:app` makes one, installs it from the tarballs,
 * commits it through its hook, and runs what its developer runs: `vp run verify`, `vp run shot --all` and `vp build`.
 * Run it with `vp run @basis/create#prove`, which builds both packages first, as packages/ui/CONTRIBUTING.md says;
 * `-- --keep` keeps the app that passed. A stage that fails prints one ERROR line naming it, and keeps the app. */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
// Vite+'s own renames in an org template, since a packed package drops its `.gitignore`.
const renamed: Readonly<Record<string, string>> = { _gitignore: ".gitignore", _npmrc: ".npmrc" };
// The template's route with a parameter, which `vp run shot --all` skips, at its sample fixture's bond.
const parameterRoutes = ["/bonds/US91282CRF04"];
const appName = "positions-ui";
const millisecondsInSecond = 1000;

interface Work {
  readonly root: string;
  readonly app: string;
  readonly tarballs: string;
  /** The environment the app's commands run in: the machine's, without what a commit hook or a workspace sets. */
  readonly env: NodeJS.ProcessEnv;
}

interface Stage {
  readonly name: string;
  readonly run: (work: Work) => void;
}

/** What a stage throws: its message says what failed, in the line that names the stage. */
class StageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "StageError";
  }
}

/** Runs a command with its output on this one's, and throws when it fails. */
function run(
  env: NodeJS.ProcessEnv,
  cwd: string,
  [command = "", ...args]: readonly string[],
): void {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) {
    const exit = result.error?.message ?? `exited with ${String(result.status ?? result.signal)}`;
    throw new StageError(`${[command, ...args].join(" ")} ${exit}`);
  }
}

/** Packs a package of the workspace, in its environment, printing its list of files only when it fails. */
function packPackage(name: string, destination: string): void {
  const result = spawnSync("vp", ["pm", "pack", "--pack-destination", destination], {
    cwd: path.join(repo, "packages", name),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stdout.write(`${result.stdout}${result.stderr}`);
    throw new StageError(`vp pm pack in packages/${name} exited with ${String(result.status)}`);
  }
  process.stdout.write(`Packed @basis/${name}.\n`);
}

function git(work: Work, ...args: readonly string[]): string {
  const identity = ["-c", "user.name=Template", "-c", "user.email=template@example.com"];
  const result = spawnSync("git", [...identity, ...args], {
    cwd: work.app,
    encoding: "utf8",
    env: work.env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    throw new StageError(`git ${args.join(" ")} exited with ${String(result.status)}`);
  }
  return result.stdout;
}

function tarball(work: Work, name: string): string {
  const file = readdirSync(work.tarballs).find((entry) => entry.startsWith(`basis-${name}-`));
  if (file === undefined) {
    throw new StageError(`vp pm pack wrote no basis-${name}-*.tgz`);
  }
  return path.join(work.tarballs, file);
}

/** A pnpmfile, outside the app, that installs both packages from their tarballs wherever they are named: in the
 * app's package.json, and in @basis/parallax's dependency on @basis/ui. */
function writePnpmfile(work: Work): void {
  const tarballs = Object.fromEntries(
    ["ui", "parallax"].map((name) => [`@basis/${name}`, `file:${tarball(work, name)}`]),
  );
  writeFileSync(
    path.join(work.root, "pnpmfile.cjs"),
    `const tarballs = ${JSON.stringify(tarballs)};
function readPackage(pkg) {
  for (const field of ["dependencies", "devDependencies"]) {
    for (const name of Object.keys(tarballs)) {
      if (pkg[field]?.[name] !== undefined) pkg[field][name] = tarballs[name];
    }
  }
  return pkg;
}
module.exports = { hooks: { readPackage } };
`,
  );
}

/** What `vp create` does to an org template once copied: its renames, and its package's name. */
function finishCopy(app: string): void {
  for (const [from, to] of Object.entries(renamed)) {
    if (existsSync(path.join(app, from))) {
      renameSync(path.join(app, from), path.join(app, to));
    }
  }
  const manifest = path.join(app, "package.json");
  const text = readFileSync(manifest, "utf8");
  writeFileSync(manifest, text.replace(/"name": "[^"]*"/u, `"name": "${appName}"`));
}

/** Copies the packed template as `vp create` copies an org template, and makes it a git repository. */
function makeApp(work: Work): void {
  const unpacked = path.join(work.root, "create");
  mkdirSync(unpacked);
  run(work.env, work.root, ["tar", "-xzf", tarball(work, "create"), "-C", unpacked]);
  cpSync(path.join(unpacked, "package/templates/app"), work.app, { recursive: true });
  finishCopy(work.app);
  writePnpmfile(work);
  // Before the install, so that `prepare` installs the app's hooks.
  git(work, "init", "--quiet", "--initial-branch=main");
}

const stages: readonly Stage[] = [
  {
    name: "pack",
    run: (work): void => {
      for (const name of ["ui", "parallax", "create"]) {
        packPackage(name, work.tarballs);
      }
    },
  },
  { name: "make", run: makeApp },
  {
    name: "install",
    run: (work): void => {
      // With no lockfile yet, which CI would otherwise demand.
      run(work.env, work.app, ["vp", "install", "--no-frozen-lockfile"]);
    },
  },
  {
    name: "commit",
    run: (work): void => {
      git(work, "add", "--all");
      // Through the app's commit hook: vp staged, then verify's fast stages.
      git(work, "commit", "--quiet", "--message", "An app from @basis/create");
    },
  },
  {
    name: "verify",
    run: (work): void => {
      run(work.env, work.app, ["vp", "run", "verify"]);
    },
  },
  {
    name: "shot",
    run: (work): void => {
      run(work.env, work.app, ["vp", "run", "shot", "--all", ...parameterRoutes]);
    },
  },
  {
    name: "build",
    run: (work): void => {
      run(work.env, work.app, ["vp", "build"]);
    },
  },
  {
    name: "clean",
    run: (work): void => {
      const changed = git(work, "status", "--porcelain").trim().split("\n").filter(Boolean);
      if (changed.length > 0) {
        const files = changed.map((line) => line.slice("?? ".length)).join(", ");
        throw new StageError(
          `the tasks left ${files} for git to commit, which .gitignore should name`,
        );
      }
    },
  },
];

/** The environment without git's variables, which a commit hook sets, and without the workspace's package manager's,
 * which `vp run` sets, so that the app's commands find the app's own. */
function appEnvironment(root: string): NodeJS.ProcessEnv {
  const kept = Object.entries(process.env).filter(
    ([name]) => !name.startsWith("GIT_") && !name.startsWith("npm_") && !name.startsWith("PNPM_"),
  );
  return { ...Object.fromEntries(kept), pnpm_config_pnpmfile: path.join(root, "pnpmfile.cjs") };
}

function seconds(since: number): string {
  return `${((performance.now() - since) / millisecondsInSecond).toFixed(1)} s`;
}

function prove(work: Work): string | undefined {
  for (const stage of stages) {
    const started = performance.now();
    process.stdout.write(`\n== ${stage.name}\n`);
    try {
      stage.run(work);
    } catch (error) {
      const reason = error instanceof StageError ? error.message : String(error);
      return `ERROR the template's ${stage.name} stage failed: ${reason}. The app is kept at ${work.app}: fix what the output above says, in packages/create/templates/app or the package it names, then run vp run @basis/create#prove again.`;
    }
    process.stdout.write(`== ${stage.name} passed in ${seconds(started)}\n`);
  }
  return undefined;
}

/** A new temporary folder outside the workspace, for the tarballs and the app. */
function newWork(): Work {
  const root = mkdtempSync(path.join(tmpdir(), "basis-template-"));
  return {
    app: path.join(root, appName),
    env: appEnvironment(root),
    root,
    tarballs: path.join(root, "tarballs"),
  };
}

function main(): void {
  const started = performance.now();
  const work = newWork();
  const failure = prove(work);
  if (failure !== undefined) {
    process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  if (!process.argv.includes("--keep")) {
    rmSync(work.root, { force: true, recursive: true });
  }
  process.stdout.write(`\nThe template passed every stage in ${seconds(started)}.\n`);
}

main();
