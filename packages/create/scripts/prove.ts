/* Proves the app template: packs @basis/ui, @basis/parallax and @basis/create as an app receives them, makes an app
 * outside the workspace as its developer does, with `vp dlx` of the packed @basis/create and the app's name, installs
 * it from the tarballs, commits it through its hook, and runs what its developer runs: `vp run verify`, `vp run shot
 * --all` with no `vp dev` running, and `vp build`. Run it with `vp run @basis/create#prove`, which builds both packages
 * first, as packages/ui/CONTRIBUTING.md says; `-- --keep` keeps the app that passed, and `-- --tarballs DIR` takes the
 * three tarballs from DIR rather than packing them, as CI's Windows job does with those its Linux job packed. A stage
 * that fails prints one ERROR line naming it, and keeps the app. */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
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
    throw new StageError(`${work.tarballs} holds no basis-${name}-*.tgz`);
  }
  return path.join(work.tarballs, file);
}

/** A pnpmfile, outside the app, that installs both packages from their tarballs wherever they are named: in the
 * app's package.json, and in @basis/parallax's dependency on @basis/ui. */
function writePnpmfile(work: Work): void {
  const tarballs = Object.fromEntries(
    ["ui", "parallax"].map((name) => [
      `@basis/${name}`,
      `file:${tarball(work, name).replaceAll("\\", "/")}`,
    ]),
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

/** Makes the app as its developer does, `vp dlx @basis/create NAME`, from the packed @basis/create: the creator copies
 * the template, names the app and runs git init, before the install, so that `prepare` installs the app's hooks. */
function makeApp(work: Work): void {
  // First, since the environment names it, and pnpm refuses a pnpmfile it cannot find, vp dlx's install too.
  writePnpmfile(work);
  run(work.env, work.root, ["vp", "dlx", tarball(work, "create"), appName]);
  if (!existsSync(path.join(work.app, ".git"))) {
    throw new StageError(`@basis/create made no git repository at ${work.app}`);
  }
}

const packStage: Stage = {
  name: "pack",
  run: (work): void => {
    for (const name of ["ui", "parallax", "create"]) {
      packPackage(name, work.tarballs);
    }
  },
};

const stages: readonly Stage[] = [
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
      // With no vp dev running, so that shot starts its own, and must stop it for the stage to end.
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

function prove(work: Work, all: readonly Stage[]): string | undefined {
  for (const stage of all) {
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

/** A new temporary folder outside the workspace, for the app, and the tarballs unless `given` names their folder. */
function newWork(given: string | undefined): Work {
  const root = mkdtempSync(path.join(tmpdir(), "basis-template-"));
  return {
    app: path.join(root, appName),
    env: appEnvironment(root),
    root,
    tarballs: given === undefined ? path.join(root, "tarballs") : path.resolve(given),
  };
}

/** The folder `--tarballs DIR` names, if the arguments give one. */
function tarballsOption(args: readonly string[]): string | undefined {
  const at = args.indexOf("--tarballs");
  return at === -1 ? undefined : args[at + 1];
}

/** The stages to run: the pack's too, unless the tarballs were given. */
function stagesFor(given: string | undefined): readonly Stage[] {
  return given === undefined ? [packStage, ...stages] : stages;
}

function main(): void {
  const started = performance.now();
  const given = tarballsOption(process.argv.slice(2));
  const work = newWork(given);
  const failure = prove(work, stagesFor(given));
  if (failure === undefined) {
    if (!process.argv.includes("--keep")) {
      rmSync(work.root, { force: true, recursive: true });
    }
    process.stdout.write(`\nThe template passed every stage in ${seconds(started)}.\n`);
  } else {
    process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
  }
}

main();
